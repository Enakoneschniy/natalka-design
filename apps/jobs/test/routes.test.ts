import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { fetchSettled, testEnv, tokenFor } from './env';

const call = (method: string, path: string, body?: unknown, session?: string, key: string | null = 'test-pro-key') =>
  fetchSettled(
    new Request(`https://jobs.test${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(key === null ? {} : { 'x-pro-key': key }),
        ...(session ? { authorization: `Bearer ${session}` } : {}),
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

async function sessionFor(email: string): Promise<string> {
  const token = await tokenFor(email);
  const response = await call('POST', '/v1/pro/session', { token });
  expect(response.status).toBe(200);
  return ((await response.json()) as { session: string }).session;
}

describe('/v1/pro', () => {
  it('accepts a sign-in request for a new and a known address alike', async () => {
    await sessionFor('known@routes.test');
    for (const email of ['known@routes.test', 'stranger@routes.test']) {
      const response = await call('POST', '/v1/pro/login', { email });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it('rejects a bad address and a body that is not JSON', async () => {
    expect((await call('POST', '/v1/pro/login', { email: 'nope' })).status).toBe(400);
    expect((await call('POST', '/v1/pro/login', '{not json')).status).toBe(400);
  });

  it('never spends a sign-in token on a GET', async () => {
    const token = (await tokenFor('scanner@routes.test')) as string;
    const scanned = await SELF.fetch(`https://jobs.test/v1/pro/session?token=${token}`, {
      headers: { 'x-pro-key': 'test-pro-key' },
    });
    expect(scanned.status).not.toBe(200);
    expect((await call('POST', '/v1/pro/session', { token })).status).toBe(200);
  });

  it('refuses a spent token', async () => {
    const token = await tokenFor('spent@routes.test');
    await call('POST', '/v1/pro/session', { token });
    const again = await call('POST', '/v1/pro/session', { token });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'link expired' });
  });

  it('shows the seller their balance and invite state', async () => {
    const session = await sessionFor('me@routes.test');
    const me = await call('GET', '/v1/pro/me', undefined, session);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      email: 'me@routes.test',
      name: 'Test',
      tone: 'vy',
      balance: 0,
      invite_redeemed: false,
    });
  });

  it('redeems an invite and reports the new balance', async () => {
    await testEnv.DB.prepare(
      "INSERT INTO pro_invite_codes (code, credits, max_uses, created_at) VALUES ('ROUTES3', 3, 10, '2026-10-03T00:00:00.000Z')",
    ).run();
    const session = await sessionFor('invited@routes.test');
    const first = await call('POST', '/v1/pro/invite', { code: 'routes3' }, session);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ credits: 3, balance: 3 });
    expect((await call('POST', '/v1/pro/invite', { code: 'ROUTES3' }, session)).status).toBe(409);
    expect((await call('POST', '/v1/pro/invite', { code: 'NOSUCH' }, session)).status).toBe(409);
  });

  it('answers an unknown code with 404 for a seller who has none yet', async () => {
    const session = await sessionFor('wrongcode@routes.test');
    expect((await call('POST', '/v1/pro/invite', { code: 'NOSUCH' }, session)).status).toBe(404);
  });

  it('answers 429 once a seller has tried five codes that did not work this hour', async () => {
    await testEnv.DB.prepare(
      "INSERT INTO pro_invite_codes (code, credits, max_uses, created_at) VALUES ('CHR-ROUT-ES29', 3, 1, '2026-10-03T00:00:00.000Z')",
    ).run();
    const session = await sessionFor('guessing@routes.test');
    for (let i = 0; i < 5; i++) {
      expect((await call('POST', '/v1/pro/invite', { code: `CHR-GUES-S00${i}` }, session)).status).toBe(404);
    }
    const refused = await call('POST', '/v1/pro/invite', { code: 'CHR-ROUT-ES29' }, session);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too_many' });
  });

  it('signs out everywhere', async () => {
    const session = await sessionFor('leaving@routes.test');
    expect((await call('POST', '/v1/pro/logout', {}, session)).status).toBe(200);
    expect((await call('GET', '/v1/pro/me', undefined, session)).status).toBe(401);
  });

  it('answers 401 without a session and with a forged one', async () => {
    expect((await call('GET', '/v1/pro/me')).status).toBe(401);
    expect((await call('GET', '/v1/pro/me', undefined, 'a.b.c')).status).toBe(401);
  });

  it('answers 401 to a caller without the shared key, before doing any work', async () => {
    const response = await call('POST', '/v1/pro/login', { email: 'nokey@routes.test' }, undefined, null);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('answers 401 to a wrong key, even with a valid session', async () => {
    expect((await call('POST', '/v1/pro/login', { email: 'a@routes.test' }, undefined, 'nope')).status).toBe(401);
    const session = await sessionFor('wrongkey@routes.test');
    expect((await call('GET', '/v1/pro/me', undefined, session, 'test-pro-key-x')).status).toBe(401);
    expect((await call('GET', '/v1/pro/me', undefined, session, 'wrong')).status).toBe(401);
  });

  it('leaves the B2C routes alone', async () => {
    expect((await SELF.fetch('https://jobs.test/health')).status).toBe(200);
  });
});
