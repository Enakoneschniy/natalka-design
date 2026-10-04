import { SELF } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const sha256 = async (raw: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** With no mail key the worker logs the link it would have sent; the spy keeps those out of the
 * test output and hands the real token to the test. */
let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
});
afterEach(() => vi.restoreAllMocks());

/** The token in the last link the worker logged, checked to be a /login/ link whose hash is stored. */
async function lastLinkToken(email: string): Promise<string> {
  const link = logged.at(-1)?.match(/(https?:\/\/\S+)$/)?.[1];
  expect(link).toBeTruthy();
  const match = (link as string).match(/\/login\/([\w-]+)$/);
  expect(match).toBeTruthy();
  const token = (match as RegExpMatchArray)[1] as string;
  const row = await testEnv.DB.prepare('SELECT 1 AS yes FROM pro_login_tokens WHERE email = ? AND token_hash = ?')
    .bind(email, await sha256(token))
    .first();
  expect(row).toBeTruthy();
  return token;
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
    const token = await lastLinkToken('known@signup.test');
    expect((await call('/v1/pro/session', { token })).status).toBe(200);
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

    const token = await lastLinkToken('new@signup.test');
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

    const token = await lastLinkToken('old@signup.test');
    expect((await call('/v1/pro/session', { token })).status).toBe(200);
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
    const token = await lastLinkToken('badcode@signup.test');
    const started = await call('/v1/pro/session', { token });
    expect(started.status).toBe(200);
    const { session } = (await started.json()) as { session: string };
    const me = (await (await call('/v1/pro/me', undefined, session)).json()) as Record<string, unknown>;
    expect(me).toMatchObject({ balance: 0, invite_redeemed: false });
  });

  it('spends a sign-up token once', async () => {
    await call('/v1/pro/signup', { email: 'twice@signup.test', name: 'Оля', terms: true });
    const token = await lastLinkToken('twice@signup.test');
    expect((await call('/v1/pro/session', { token })).status).toBe(200);
    const again = await call('/v1/pro/session', { token });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'link expired' });
  });
});

describe('the answer and the throttle', () => {
  it('shares one throttle between sign-up and login, and still answers 202', async () => {
    const email = 'busy@signup.test';
    await signIn(email); // registers the address; its token is the 1st this hour
    const body = { email, name: 'Катя', terms: true };
    for (let i = 0; i < 2; i++) expect((await call('/v1/pro/signup', body)).status).toBe(202);
    for (let i = 0; i < 2; i++) expect((await call('/v1/pro/login', { email })).status).toBe(202);
    expect(await tokens(email)).toHaveLength(5);

    logged = [];
    const sixth = await call('/v1/pro/signup', body);
    expect(sixth.status).toBe(202);
    expect(await sixth.json()).toEqual({ ok: true });
    expect(await tokens(email)).toHaveLength(5);
    expect(logged).toHaveLength(0);
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
