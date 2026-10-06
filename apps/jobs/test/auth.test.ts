import { describe, expect, it } from 'vitest';
import { signToken } from '../src/crypto';
import {
  authenticate,
  consumeLoginToken,
  createLoginToken,
  createSignupToken,
  endSessions,
  issueSession,
  LINKS_PER_ADDRESS_HOUR,
  LINKS_PER_REQUESTER_HOUR,
  normalizeEmail,
} from '../src/pro/auth';
import { signIn, TEST_REQUESTER, testEnv } from './env';

const bearer = (token: string) =>
  new Request('https://jobs.test/v1/pro/me', { headers: { authorization: `Bearer ${token}` } });

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Anna@Mail.RU ')).toBe('anna@mail.ru');
  });

  it('rejects what is not an address', () => {
    for (const bad of ['', 'anna', 'a@b', 'a b@c.de', `${'a'.repeat(250)}@x.io`, 42, null]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe('login tokens', () => {
  it('creates the account on first use of a sign-up token and works only once', async () => {
    const raw = await createSignupToken(testEnv.DB, 'first@auth.test', TEST_REQUESTER, { name: 'Первая' });
    expect(raw).toBeTruthy();
    const account = await consumeLoginToken(testEnv.DB, raw as string);
    expect(account?.email).toBe('first@auth.test');
    expect(account?.tone).toBe('vy');
    expect(await consumeLoginToken(testEnv.DB, raw as string)).toBeNull();
  });

  it('signs one address into one account however it was typed', async () => {
    const a = await signIn(normalizeEmail(' Same@Auth.TEST') as string);
    const b = await signIn(normalizeEmail('same@auth.test') as string);
    expect(a.account.id).toBe(b.account.id);
  });

  it('refuses an expired token', async () => {
    const raw = (await createSignupToken(testEnv.DB, 'late@auth.test', TEST_REQUESTER, { name: 'Поздняя' })) as string;
    await testEnv.DB.prepare(
      "UPDATE pro_login_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?",
    )
      .bind('late@auth.test')
      .run();
    expect(await consumeLoginToken(testEnv.DB, raw)).toBeNull();
  });

  it('refuses an unknown or empty token', async () => {
    expect(await consumeLoginToken(testEnv.DB, 'never-issued')).toBeNull();
    expect(await consumeLoginToken(testEnv.DB, '')).toBeNull();
  });

  it('keeps only a hash of the token', async () => {
    const raw = (await createLoginToken(testEnv.DB, 'hash@auth.test', TEST_REQUESTER)) as string;
    const row = await testEnv.DB.prepare('SELECT token_hash FROM pro_login_tokens WHERE email = ?')
      .bind('hash@auth.test')
      .first<{ token_hash: string }>();
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.token_hash).not.toBe(raw);
  });

  it(`stops issuing after ${LINKS_PER_REQUESTER_HOUR} links an hour to one requester`, async () => {
    for (let i = 0; i < LINKS_PER_REQUESTER_HOUR; i++) {
      expect(await createLoginToken(testEnv.DB, 'busy@auth.test', 'one')).toBeTruthy();
    }
    expect(await createLoginToken(testEnv.DB, 'busy@auth.test', 'one')).toBeNull();
    expect(await createSignupToken(testEnv.DB, 'busy@auth.test', 'one', { name: 'Ещё' })).toBeNull();
    expect(await createLoginToken(testEnv.DB, 'busy@auth.test', 'two')).toBeTruthy();
  });

  it(`stops issuing after ${LINKS_PER_ADDRESS_HOUR} links an hour to an address, whoever asks`, async () => {
    const email = 'crowd@auth.test';
    for (let i = 0; i < LINKS_PER_ADDRESS_HOUR; i++) {
      expect(await createLoginToken(testEnv.DB, email, `requester-${i}`)).toBeTruthy();
    }
    expect(await createLoginToken(testEnv.DB, email, 'requester-new')).toBeNull();
    expect(await createLoginToken(testEnv.DB, 'other@auth.test', 'requester-new')).toBeTruthy();
  });

  it('counts no link older than an hour, and an older row without a requester only in the total', async () => {
    const email = 'aged@auth.test';
    for (let i = 0; i < LINKS_PER_REQUESTER_HOUR; i++) await createLoginToken(testEnv.DB, email, 'aged');
    await testEnv.DB.prepare('UPDATE pro_login_tokens SET created_at = ? WHERE email = ?')
      .bind(new Date(Date.now() - 61 * 60 * 1000).toISOString(), email)
      .run();
    expect(await createLoginToken(testEnv.DB, email, 'aged')).toBeTruthy();

    // Rows the worker before this one wrote carry no requester.
    const legacy = 'legacy@auth.test';
    const ts = new Date().toISOString();
    for (let i = 0; i < LINKS_PER_ADDRESS_HOUR - 1; i++) {
      await testEnv.DB.prepare('INSERT INTO pro_login_tokens (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), legacy, ts, ts)
        .run();
    }
    expect(await createLoginToken(testEnv.DB, legacy, 'fresh')).toBeTruthy();
    expect(await createLoginToken(testEnv.DB, legacy, 'fresh')).toBeNull();
  });

  it('never lets racing requests past the limits', async () => {
    const issued = await Promise.all(
      Array.from({ length: LINKS_PER_REQUESTER_HOUR + 7 }, () => createLoginToken(testEnv.DB, 'race@auth.test', 'racer')),
    );
    expect(issued.filter(Boolean)).toHaveLength(LINKS_PER_REQUESTER_HOUR);
  });
});

describe('sessions', () => {
  it('authenticates a fresh session', async () => {
    const { account, session } = await signIn('fresh@auth.test');
    expect((await authenticate(bearer(session), testEnv))?.id).toBe(account.id);
  });

  it('stops working after the account signs out everywhere', async () => {
    const { account, session } = await signIn('out@auth.test');
    await endSessions(testEnv.DB, account.id);
    expect(await authenticate(bearer(session), testEnv)).toBeNull();
    const again = await issueSession(testEnv, { ...account, session_epoch: account.session_epoch + 1 });
    expect((await authenticate(bearer(again), testEnv))?.id).toBe(account.id);
  });

  it('refuses a token signed with the download-link key', async () => {
    const { account } = await signIn('replay@auth.test');
    const forged = await signToken(
      { typ: 'pro', sub: account.id, epoch: account.session_epoch },
      testEnv.LINK_KEY,
      60,
    );
    expect(await authenticate(bearer(forged), testEnv)).toBeNull();
  });

  it('refuses a session-key token of another type', async () => {
    const { account } = await signIn('typ@auth.test');
    const other = await signToken({ sub: account.id, epoch: 0 }, testEnv.SESSION_KEY, 60);
    expect(await authenticate(bearer(other), testEnv)).toBeNull();
  });

  it('answers garbage with null, not an exception', async () => {
    for (const junk of ['', 'abc', 'a.b.c', 'not.a.token!', '%%%.%%%.%%%']) {
      expect(await authenticate(bearer(junk), testEnv)).toBeNull();
    }
    expect(await authenticate(new Request('https://jobs.test/'), testEnv)).toBeNull();
  });
});
