import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hmacHex } from '../src/crypto';
import { LINKS_PER_ADDRESS_HOUR, LINKS_PER_REQUESTER_HOUR } from '../src/pro/auth';
import { addressBlock } from '../src/pro/requester';
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

/** A sign-in request for `email` from `ip` (none: no x-client-ip), with its letter sent before
 * the promise settles. */
const askFrom = (email: string, ip?: string) =>
  handlePro(
    new Request('https://jobs.test/v1/pro/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pro-key': 'test-pro-key',
        ...(ip === undefined ? {} : { 'x-client-ip': ip }),
      },
      body: JSON.stringify({ email }),
    }),
    testEnv,
    new URL('https://jobs.test/v1/pro/login'),
  );

const requesters = async (email: string): Promise<string[]> =>
  (
    await testEnv.DB.prepare(
      "SELECT requester FROM pro_login_tokens WHERE email = ? AND requester != 'test-requester' ORDER BY rowid",
    )
      .bind(email)
      .all<{ requester: string }>()
  ).results.map((row) => row.requester);

const perRequester = (list: string[]) =>
  list.reduce((counts, requester) => counts.set(requester, (counts.get(requester) ?? 0) + 1), new Map<string, number>());

/** Marks the links `requester` asked for as opened at `at` — what spending one does. A link opened
 * in the past was also asked for then. */
const opened = (email: string, requester: string, at: Date) =>
  testEnv.DB.prepare(
    `UPDATE pro_login_tokens SET used_at = ?, created_at = MIN(created_at, ?), expires_at = MIN(expires_at, ?)
     WHERE email = ? AND requester = ?`,
  )
    .bind(at.toISOString(), at.toISOString(), at.toISOString(), email, requester)
    .run();

describe('the block an address belongs to', () => {
  it('is an IPv4 address itself, written one way', () => {
    expect(addressBlock('203.0.113.7')).toBe('203.0.113.7');
    expect(addressBlock(' 203.0.113.7 ')).toBe('203.0.113.7');
    expect(addressBlock('203.0.113.007')).toBe('203.0.113.7');
    expect(addressBlock('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(addressBlock('::FFFF:cb00:7107')).toBe('203.0.113.7');
  });

  it('is the /64 of an IPv6 address, however the address is written', () => {
    const block = '2001:db8:1:2::/64';
    for (const address of [
      '2001:db8:1:2::1',
      '2001:db8:1:2:ffff:ffff:ffff:ffff',
      '2001:0DB8:0001:0002:0000:0000:0000:abcd',
      '2001:db8:1:2:a:b:192.0.2.1',
      '2001:db8:1:2::',
    ]) {
      expect(addressBlock(address), address).toBe(block);
    }
    expect(addressBlock('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    expect(addressBlock('::1')).toBe('0:0:0:0::/64');
  });

  it('is nothing for what is not one address', () => {
    for (const raw of [
      null,
      undefined,
      '',
      '   ',
      'unknown',
      '256.1.1.1',
      '1.2.3',
      '1.2.3.4.5',
      '1.2.3.-4',
      '2001:db8::1::2',
      '2001:db8::g',
      '12345::1',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7:8::',
      '1:2:3:4:5:6:7',
      '1.2.3.4::',
      'fe80::1%eth0',
      '2001:db8::1, 203.0.113.7',
      `${'1:'.repeat(30)}1`,
    ]) {
      expect(addressBlock(raw), String(raw)).toBeNull();
    }
  });
});

describe('who asked for a link', () => {
  it('is kept as an HMAC of their block under the session key, never the address', async () => {
    const email = 'hashed@sign-in.test';
    await signIn(email);
    await askFrom(email, '203.0.113.9');
    await askFrom(email, ' 203.0.113.9 ');
    await askFrom(email, '2001:db8:5:6::1');
    const [first, again, v6] = await requesters(email);
    expect(first).toBe((await hmacHex(testEnv.SESSION_KEY, '203.0.113.9')).slice(0, 32));
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(again).toBe(first);
    expect(v6).toBe((await hmacHex(testEnv.SESSION_KEY, '2001:db8:5:6::/64')).slice(0, 32));
    expect(JSON.stringify(await requesters(email))).not.toContain('203.0.113.9');
  });

  it("is 'unknown' without a usable address", async () => {
    const email = 'nobody@sign-in.test';
    await signIn(email);
    await askFrom(email);
    await askFrom(email, 'not-an-address');
    await askFrom(email, 'x'.repeat(65));
    expect(await requesters(email)).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('shares one limit across the addresses of one IPv6 /64', async () => {
    const email = 'rotating@sign-in.test';
    await signIn(email);
    for (let i = 1; i <= LINKS_PER_REQUESTER_HOUR + 3; i++) await askFrom(email, `2001:db8:aa:bb::${i.toString(16)}`);
    expect(await requesters(email)).toHaveLength(LINKS_PER_REQUESTER_HOUR);
    await askFrom(email, '2001:db8:aa:bc::1');
    expect(await requesters(email)).toHaveLength(LINKS_PER_REQUESTER_HOUR + 1);
  });

  it('who opened a link to the address this month is held to their own five only, past the twenty', async () => {
    const email = 'usual@sign-in.test';
    await signIn(email);
    const home = '203.0.113.50';
    const homeHash = (await hmacHex(testEnv.SESSION_KEY, home)).slice(0, 32);
    await askFrom(email, home);
    await opened(email, homeHash, new Date());
    // Others use up the address's hour, each from an address of their own.
    for (let i = 1; i <= LINKS_PER_ADDRESS_HOUR; i++) await askFrom(email, `198.51.100.${i}`);
    expect(await tokenCount(email)).toBe(LINKS_PER_ADDRESS_HOUR);

    for (let i = 0; i < LINKS_PER_REQUESTER_HOUR + 2; i++) await askFrom(email, home);
    expect(perRequester(await requesters(email)).get(homeHash)).toBe(LINKS_PER_REQUESTER_HOUR);
    const after = await tokenCount(email);
    await askFrom(email, '192.0.2.77');
    expect(await tokenCount(email)).toBe(after);
  });

  it('who opened a link more than a month ago, or asked without an address, is held to the twenty', async () => {
    const email = 'stale@sign-in.test';
    await signIn(email);
    const home = '203.0.113.60';
    const homeHash = (await hmacHex(testEnv.SESSION_KEY, home)).slice(0, 32);
    await askFrom(email, home);
    await opened(email, homeHash, new Date(Date.now() - 31 * 86_400_000));
    await askFrom(email);
    await opened(email, 'unknown', new Date());
    for (let i = 1; i <= LINKS_PER_ADDRESS_HOUR; i++) await askFrom(email, `198.51.100.${i}`);

    // Each of these would still be within its own five.
    const full = await tokenCount(email);
    await askFrom(email, home);
    await askFrom(email);
    await askFrom(email, '192.0.2.78');
    expect(await tokenCount(email)).toBe(full);
  });

  it('without an address is still held to the limits of the address it asks for', async () => {
    const email = 'anonymous@sign-in.test';
    await signIn(email); // one link already, by the tests' own requester
    for (let i = 0; i < LINKS_PER_REQUESTER_HOUR + 2; i++) await askFrom(email);
    expect(await requesters(email)).toEqual(new Array(LINKS_PER_REQUESTER_HOUR).fill('unknown'));

    // Links asked for without an address count towards the address's twenty like any others.
    for (let i = 0; ; i++) {
      const before = (await requesters(email)).length;
      await askFrom(email, `198.51.100.${i}`);
      if ((await requesters(email)).length === before) break;
    }
    const total = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?')
      .bind(email)
      .first<{ n: number }>();
    expect(total?.n).toBe(LINKS_PER_ADDRESS_HOUR);
    await askFrom(email);
    await askFrom(email, '192.0.2.200');
    expect(
      (await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?').bind(email).first<{ n: number }>())
        ?.n,
    ).toBe(LINKS_PER_ADDRESS_HOUR);
  });
});

describe('thirty requests at once', () => {
  it('from one address get five links', async () => {
    const email = 'burst-one@sign-in.test';
    await signIn(email);
    await Promise.all(Array.from({ length: 30 }, () => askFrom(email, '203.0.113.30')));
    expect(await requesters(email)).toHaveLength(LINKS_PER_REQUESTER_HOUR);
  });

  it('from thirty addresses get twenty links, the first sign-in included', async () => {
    const email = 'burst-many@sign-in.test';
    await signIn(email);
    await Promise.all(Array.from({ length: 30 }, (_, i) => askFrom(email, `198.51.100.${i + 1}`)));
    expect(await requesters(email)).toHaveLength(LINKS_PER_ADDRESS_HOUR - 1);
  });

  it('from a mix, with and without an address, never pass either limit', async () => {
    const email = 'burst-mixed@sign-in.test';
    await signIn(email);
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        i % 3 === 0 ? askFrom(email) : i % 3 === 1 ? askFrom(email, `2001:db8:77:1::${i}`) : askFrom(email, `192.0.2.${i}`),
      ),
    );
    const list = await requesters(email);
    expect(list).toHaveLength(LINKS_PER_ADDRESS_HOUR - 1);
    for (const [requester, count] of perRequester(list)) expect(count, requester).toBeLessThanOrEqual(LINKS_PER_REQUESTER_HOUR);
  });
});
