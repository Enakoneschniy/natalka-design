import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { consumeLoginToken, createLoginToken } from '../src/pro/auth';
import { signIn, testEnv } from './env';

const call = (path: string, body?: unknown, session?: string) =>
  SELF.fetch(`https://jobs.test${path}`, {
    method: path === '/v1/pro/me' ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pro-key': 'test-pro-key',
      ...(session ? { authorization: `Bearer ${session}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

interface TokenRow {
  purpose: string;
  signup_name: string | null;
  signup_invite: string | null;
}
const tokens = async (email: string): Promise<TokenRow[]> =>
  (
    await testEnv.DB.prepare('SELECT purpose, signup_name, signup_invite FROM pro_login_tokens WHERE email = ?')
      .bind(email)
      .all<TokenRow>()
  ).results;

/** The raw token is only in the letter, so tests swap the stored hash for one they know. */
async function knownToken(email: string): Promise<string> {
  const raw = `known-${email}`;
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await testEnv.DB.prepare('UPDATE pro_login_tokens SET token_hash = ? WHERE email = ?').bind(hash, email).run();
  return raw;
}

const accounts = async (email: string) =>
  (
    await testEnv.DB.prepare('SELECT id, name, terms_accepted_at FROM pro_accounts WHERE email = ?')
      .bind(email)
      .all<{ id: string; name: string | null; terms_accepted_at: string | null }>()
  ).results;

describe('POST /v1/pro/login', () => {
  it('answers 202 for an unknown address and stores no token', async () => {
    const response = await call('/v1/pro/login', { email: 'ghost@signup.test' });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(await tokens('ghost@signup.test')).toHaveLength(0);
  });

  it('answers 202 for a known address and stores one login token', async () => {
    await signIn('known@signup.test');
    const before = (await tokens('known@signup.test')).length;
    const response = await call('/v1/pro/login', { email: 'known@signup.test' });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    const after = await tokens('known@signup.test');
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)?.purpose).toBe('login');
  });
});

describe('POST /v1/pro/signup', () => {
  it('registers a new address after it is confirmed, with the invite applied', async () => {
    await testEnv.DB.prepare("INSERT INTO pro_invite_codes (code, credits, max_uses, created_at) VALUES ('START3', 3, 10, ?)")
      .bind(new Date().toISOString())
      .run();
    const response = await call('/v1/pro/signup', {
      email: 'new@signup.test',
      name: ' Мария ',
      invite: 'start3',
      terms: true,
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(await tokens('new@signup.test')).toEqual([
      { purpose: 'signup', signup_name: 'Мария', signup_invite: 'START3' },
    ]);
    expect(await accounts('new@signup.test')).toHaveLength(0);

    const token = await knownToken('new@signup.test');
    const started = await call('/v1/pro/session', { token });
    expect(started.status).toBe(200);
    const { session } = (await started.json()) as { session: string };
    const [account] = await accounts('new@signup.test');
    expect(account?.name).toBe('Мария');
    expect(account?.terms_accepted_at).toBeTruthy();

    const me = (await (await call('/v1/pro/me', undefined, session)).json()) as Record<string, unknown>;
    expect(me).toMatchObject({ balance: 3, invite_redeemed: true, name: 'Мария' });
  });

  it('sends a sign-in token, not a sign-up one, to an address that already has an account', async () => {
    const { account } = await signIn('old@signup.test');
    await testEnv.DB.prepare('UPDATE pro_accounts SET name = ? WHERE id = ?').bind('Старое', account.id).run();
    const before = (await tokens('old@signup.test')).length;

    const response = await call('/v1/pro/signup', { email: 'old@signup.test', name: 'Новое', terms: true });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    const rows = await tokens('old@signup.test');
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toEqual({ purpose: 'login', signup_name: null, signup_invite: null });

    await testEnv.DB.prepare("UPDATE pro_login_tokens SET token_hash = ? WHERE email = ? AND purpose = 'login' AND used_at IS NULL")
      .bind(
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('old-token')))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
        'old@signup.test',
      )
      .run();
    expect((await call('/v1/pro/session', { token: 'old-token' })).status).toBe(200);
    const after = await accounts('old@signup.test');
    expect(after).toHaveLength(1);
    expect(after[0]?.name).toBe('Старое');
  });

  it('validates the fields', async () => {
    const ok = { email: 'v@signup.test', name: 'Анна', terms: true };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...ok, terms: undefined }, 'terms'],
      [{ ...ok, terms: 'yes' }, 'terms'],
      [{ ...ok, name: '   ' }, 'name'],
      [{ ...ok, name: 'я'.repeat(61) }, 'name'],
      [{ ...ok, email: 'nope' }, 'email'],
    ];
    for (const [body, error] of cases) {
      const response = await call('/v1/pro/signup', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect(await tokens('v@signup.test')).toHaveLength(0);
  });

  it('still creates the account when the invite code is invalid', async () => {
    await call('/v1/pro/signup', { email: 'badcode@signup.test', name: 'Ира', invite: 'NOSUCH', terms: true });
    const token = await knownToken('badcode@signup.test');
    const started = await call('/v1/pro/session', { token });
    expect(started.status).toBe(200);
    const { session } = (await started.json()) as { session: string };
    const me = (await (await call('/v1/pro/me', undefined, session)).json()) as Record<string, unknown>;
    expect(me).toMatchObject({ balance: 0, invite_redeemed: false });
  });

  it('spends a sign-up token once', async () => {
    await call('/v1/pro/signup', { email: 'twice@signup.test', name: 'Оля', terms: true });
    const token = await knownToken('twice@signup.test');
    expect((await call('/v1/pro/session', { token })).status).toBe(200);
    const again = await call('/v1/pro/session', { token });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'link expired' });
  });
});

describe('a login token with no account behind it', () => {
  it('is refused and creates nothing', async () => {
    const raw = (await createLoginToken(testEnv.DB, 'deleted@signup.test')) as string;
    expect(await consumeLoginToken(testEnv.DB, raw)).toBeNull();
    const raw2 = (await createLoginToken(testEnv.DB, 'deleted2@signup.test')) as string;
    expect((await call('/v1/pro/session', { token: raw2 })).status).toBe(400);
    expect(await accounts('deleted@signup.test')).toHaveLength(0);
    expect(await accounts('deleted2@signup.test')).toHaveLength(0);
  });
});
