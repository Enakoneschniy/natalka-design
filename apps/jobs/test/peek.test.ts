import { describe, expect, it } from 'vitest';
import { createLoginToken, createSignupToken, maskEmail } from '../src/pro/auth';
import { fetchSettled, signIn, TEST_REQUESTER, testEnv } from './env';

const post = (path: string, body: unknown, key: string | null = 'test-pro-key') =>
  fetchSettled(
    new Request(`https://jobs.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'x-pro-key': key }) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const peek = (token: unknown, key?: string | null) => post('/v1/pro/login/peek', { token }, key);

describe('maskEmail', () => {
  it('keeps two characters of the local part, one when it has two or fewer, and the whole domain', () => {
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
    expect(maskEmail('abc@x.com')).toBe('ab***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
    expect(maskEmail('yevhenii@gmail.com')).toBe('ye***@gmail.com');
    expect(maskEmail('first.last@mail.example.co.uk')).toBe('fi***@mail.example.co.uk');
  });
});

describe('POST /v1/pro/login/peek', () => {
  it("shows whose cabinet a sign-in link opens, masked, and leaves the link to be spent", async () => {
    await signIn('peeked@peek.test');
    const token = (await createLoginToken(testEnv.DB, 'peeked@peek.test', TEST_REQUESTER)) as string;
    for (let i = 0; i < 2; i++) {
      const response = await peek(token);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ email: 'pe***@peek.test' });
    }
    expect((await post('/v1/pro/session', { token })).status).toBe(200);
    expect((await peek(token)).status).toBe(404);
  });

  it('shows the address of a sign-up link before the account exists', async () => {
    const token = (await createSignupToken(testEnv.DB, 'jo@peek.test', TEST_REQUESTER, { name: 'Jo' })) as string;
    expect(await (await peek(token)).json()).toEqual({ email: 'j***@peek.test' });
  });

  it('answers 404 for a link that is expired, unknown, or has no account behind it', async () => {
    await signIn('late@peek.test');
    const late = (await createLoginToken(testEnv.DB, 'late@peek.test', TEST_REQUESTER)) as string;
    await testEnv.DB.prepare("UPDATE pro_login_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?")
      .bind('late@peek.test')
      .run();
    const orphan = (await createLoginToken(testEnv.DB, 'nobody@peek.test', TEST_REQUESTER)) as string;
    for (const token of [late, orphan, 'never-issued', '', 42, null, 'x'.repeat(5000)]) {
      const response = await peek(token);
      expect(response.status, String(token).slice(0, 20)).toBe(404);
      expect(await response.json()).toEqual({ error: 'not found' });
    }
    expect((await post('/v1/pro/login/peek', '{not json')).status).toBe(404);
  });

  it('needs the shared key but no session', async () => {
    await signIn('keyed@peek.test');
    const token = (await createLoginToken(testEnv.DB, 'keyed@peek.test', TEST_REQUESTER)) as string;
    expect((await peek(token, null)).status).toBe(401);
    expect((await peek(token, 'wrong')).status).toBe(401);
    expect((await peek(token)).status).toBe(200);
  });
});
