import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePro } from '../src/pro/routes';
import { envWith, letters, signIn, testEnv } from './env';

beforeEach(() => {
  // The links the worker logs on a laptop stay out of the test output.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const request = (path: string, body: unknown) =>
  new Request(`https://jobs.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key' },
    body: JSON.stringify(body),
  });

const tokenCount = async (email: string) =>
  (
    await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?')
      .bind(email)
      .first<{ n: number }>()
  )?.n ?? 0;

/** The database with every query held until `open()`: whatever the handler awaits from it before
 * answering would keep the answer from coming. */
function heldDatabase(): { db: D1Database; open: () => void } {
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const hold = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'bind') return (...args: unknown[]) => hold(target.bind(...args));
        if (key === 'first' || key === 'run' || key === 'all' || key === 'raw') {
          return async (...args: unknown[]) => {
            await gate;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  const db = new Proxy(testEnv.DB, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'prepare') return (sql: string) => hold(target.prepare(sql));
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db, open };
}

/** The answer, or a failure when it does not come within a second. */
const answered = (response: Promise<Response | null>) =>
  Promise.race([
    response,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the answer waited for the database')), 1000)),
  ]);

describe('a sign-in or sign-up request', () => {
  it('is answered before the address is looked up, and the letter follows', async () => {
    const email = 'early@sign-in.test';
    await signIn(email);
    const before = await tokenCount(email);
    const { db, open } = heldDatabase();
    const ctx = createExecutionContext();

    const response = await answered(
      handlePro(request('/v1/pro/login', { email }), envWith('DB', db), new URL('https://jobs.test/v1/pro/login'), ctx),
    );
    expect(response?.status).toBe(202);
    expect(await response?.json()).toEqual({ ok: true });
    expect(await tokenCount(email)).toBe(before);

    open();
    await waitOnExecutionContext(ctx);
    expect(await tokenCount(email)).toBe(before + 1);
    expect((await letters(email)).at(-1)?.subject).toBe('Вход в Chronika Pro');
  });

  it('answers a sign-up before anything is stored, for a new address and a registered one', async () => {
    await signIn('registered@sign-in.test');
    for (const email of ['registered@sign-in.test', 'newcomer@sign-in.test']) {
      const { db, open } = heldDatabase();
      const ctx = createExecutionContext();
      const response = await answered(
        handlePro(
          request('/v1/pro/signup', { email, name: 'Ранняя', terms: true }),
          envWith('DB', db),
          new URL('https://jobs.test/v1/pro/signup'),
          ctx,
        ),
      );
      expect(response?.status, email).toBe(202);
      open();
      await waitOnExecutionContext(ctx);
    }
    expect((await letters('newcomer@sign-in.test')).at(-1)?.subject).toBe('Подтвердите почту для Chronika Pro');
    expect((await letters('registered@sign-in.test')).at(-1)?.subject).toBe('Вход в Chronika Pro');
  });

  it('keeps who asked as a short hash of their address, never the address', async () => {
    const email = 'hashed@sign-in.test';
    await signIn(email);
    const ask = (headers: Record<string, string>) =>
      handlePro(
        new Request('https://jobs.test/v1/pro/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key', ...headers },
          body: JSON.stringify({ email }),
        }),
        testEnv,
        new URL('https://jobs.test/v1/pro/login'),
      );
    await ask({ 'x-client-ip': '203.0.113.9' });
    await ask({ 'x-client-ip': ' 203.0.113.9 ' });
    await ask({ 'x-client-ip': '2001:db8::1' });
    await ask({});
    await ask({ 'x-client-ip': 'x'.repeat(65) });
    const { results } = await testEnv.DB.prepare(
      "SELECT requester FROM pro_login_tokens WHERE email = ? AND requester != 'test-requester' ORDER BY rowid",
    )
      .bind(email)
      .all<{ requester: string }>();
    const [first, again, other, none, overlong] = results.map((r) => r.requester);
    expect(results).toHaveLength(5);
    for (const requester of [first, other, none]) expect(requester).toMatch(/^[0-9a-f]{16}$/);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
    expect(none).not.toBe(first);
    expect(overlong).toBe(none);
    expect(JSON.stringify(results)).not.toContain('203.0.113.9');
  });

  it('still refuses a malformed request at once, with nothing left to run', async () => {
    const ctx = createExecutionContext();
    const response = await handlePro(
      request('/v1/pro/signup', { email: 'x@sign-in.test', name: '', terms: true }),
      testEnv,
      new URL('https://jobs.test/v1/pro/signup'),
      ctx,
    );
    expect(response?.status).toBe(400);
    await waitOnExecutionContext(ctx);
    expect(await tokenCount('x@sign-in.test')).toBe(0);
  });
});
