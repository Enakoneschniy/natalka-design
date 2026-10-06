import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeLoginToken, createLoginToken, issueSession, type ProAccount } from '../src/pro/auth';
import { putBrandImage, saveBrand } from '../src/pro/brand';
import { createClient } from '../src/pro/clients';
import { closeAccount } from '../src/pro/closing';
import { grant } from '../src/pro/credits';
import { redeemInvite } from '../src/pro/invites';
import { assemblePdf } from '../src/pro/lifecycle';
import { createPurchase } from '../src/pro/purchases';
import { createReading, readingRow } from '../src/pro/readings';
import { fileReport } from '../src/pro/reports';
import { envWith, fetchSettled, letters, runJob, signIn, TEST_REQUESTER, testEnv } from './env';
import { ANNA } from './people';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(8), ...u32(8),
  8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]).buffer as ArrayBuffer;

const call = (method: string, path: string, session?: string, body?: unknown) =>
  fetchSettled(
    new Request(`https://jobs.test${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-pro-key': 'test-pro-key',
        ...(session ? { authorization: `Bearer ${session}` } : {}),
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const close = (session: string, confirm: unknown) => call('DELETE', '/v1/pro/me', session, { confirm_email: confirm });

const count = async (sql: string, ...values: unknown[]) =>
  (await testEnv.DB.prepare(sql).bind(...values).first<{ n: number }>())?.n ?? 0;

const keysUnder = async (prefix: string) => (await testEnv.DOCS.list({ prefix })).objects.map((o) => o.key);

/** A seller with everything a cabinet holds: clients, a natal reading with its PDF, a synastry,
 * a brand with a picture, a report, a purchase, an unspent sign-in link and a wrong invite code. */
async function fullCabinet(email: string) {
  const { account, session } = await signIn(email);
  await grant(testEnv.DB, { accountId: account.id, delta: 5, reason: 'adjust', ref: null });
  const anna = await createClient(testEnv, account.id, { ...ANNA, name: 'Анна Закрытая' });
  const boris = await createClient(testEnv, account.id, { ...ANNA, name: 'Борис Закрытый', gender: 'm' });
  const natal = (await createReading(testEnv, account, { product: 'natal', client_id: anna })) as { id: string };
  const synastry = (await createReading(testEnv, account, {
    product: 'synastry',
    client_id: anna,
    partner_client_id: boris,
  })) as { id: string };
  const natalJob = (await readingRow(testEnv.DB, natal.id, account.id))?.job_id as string;
  await runJob(natalJob);
  await saveBrand(testEnv, account.id, { name: 'Бренд', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' });
  expect(await putBrandImage(testEnv, account.id, 'logo', PNG)).toBe('ok');
  expect(await assemblePdf(testEnv, account.id, natal.id)).toBe('queued');
  await runJob(natalJob);
  expect(await fileReport(testEnv, account.id, natal.id, 'a', 'не так')).toBe('ok');
  expect(await createPurchase(testEnv.DB, account.id, 'p10')).not.toBeNull();
  expect(await createLoginToken(testEnv.DB, email, TEST_REQUESTER)).not.toBeNull();
  expect((await redeemInvite(testEnv.DB, account.id, 'CHR-NOPE-NOPE')).status).toBe('invalid');
  expect(await keysUnder(`${natal.id}/`)).toHaveLength(1);
  expect(await keysUnder(`brand/${account.id}/`)).toHaveLength(1);
  return { account, session, orders: [natal.id, synastry.id] };
}

describe('DELETE /v1/pro/me', () => {
  it('deletes what the cabinet holds, keeps the ledger and purchases, and ends every session', async () => {
    const email = 'closer@close.test';
    const { account, session, orders } = await fullCabinet(email);
    const ledger = await count('SELECT COUNT(*) AS n FROM credit_ledger WHERE account_id = ?', account.id);

    const response = await close(session, '  Closer@Close.TEST ');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');

    for (const table of ['pro_clients', 'pro_readings', 'pro_reports', 'pro_brands']) {
      expect(await count(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`, account.id), table).toBe(0);
    }
    expect(await count('SELECT COUNT(*) AS n FROM orders WHERE pro_account_id = ?', account.id)).toBe(0);
    for (const order of orders) {
      for (const table of ['charts', 'jobs', 'documents']) {
        expect(await count(`SELECT COUNT(*) AS n FROM ${table} WHERE order_id = ?`, order), table).toBe(0);
      }
      expect(await keysUnder(`${order}/`)).toEqual([]);
      expect(await count("SELECT COUNT(*) AS n FROM pro_attempts WHERE kind = 'pdf' AND subject = ?", order)).toBe(0);
    }
    expect(await keysUnder(`brand/${account.id}/`)).toEqual([]);
    expect(await count('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?', email)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM pro_attempts WHERE kind = 'invite' AND subject = ?", account.id)).toBe(0);

    const row = await testEnv.DB.prepare('SELECT email, name, closed_at, session_epoch FROM pro_accounts WHERE id = ?')
      .bind(account.id)
      .first<{ email: string; name: string | null; closed_at: string | null; session_epoch: number }>();
    expect(row).toMatchObject({ email: `closed-${account.id}@invalid`, name: null, session_epoch: account.session_epoch + 1 });
    expect(row?.closed_at).toBeTruthy();
    expect(await count('SELECT COUNT(*) AS n FROM credit_ledger WHERE account_id = ?', account.id)).toBe(ledger);
    expect(await count('SELECT COUNT(*) AS n FROM pro_purchases WHERE account_id = ?', account.id)).toBe(1);

    expect((await call('GET', '/v1/pro/me', session)).status).toBe(401);
    expect((await close(session, email)).status).toBe(401);
  });

  it('answers 400 and deletes nothing unless the address typed is the cabinet’s', async () => {
    const { account, session } = await signIn('careful@close.test');
    await createClient(testEnv, account.id, ANNA);
    for (const typed of ['other@close.test', 'careful@close', '', 42, null, undefined]) {
      const response = await close(session, typed);
      expect(response.status, String(typed)).toBe(400);
      expect(await response.json()).toEqual({ error: 'confirm' });
    }
    expect((await call('DELETE', '/v1/pro/me', session, '{not json')).status).toBe(400);
    expect(await count('SELECT COUNT(*) AS n FROM pro_clients WHERE account_id = ?', account.id)).toBe(1);
    expect((await call('GET', '/v1/pro/me', session)).status).toBe(200);
  });

  it('leaves the cabinet whole when storage refuses, so it can be closed again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { account } = await fullCabinet('stuck@close.test');
    const env = envWith('DOCS', {
      list: (options: R2ListOptions) => testEnv.DOCS.list(options),
      delete: async () => Promise.reject(new Error('storage down')),
    });
    await expect(closeAccount(env, account)).rejects.toThrow('storage down');
    expect(
      await testEnv.DB.prepare('SELECT email, closed_at FROM pro_accounts WHERE id = ?').bind(account.id).first(),
    ).toEqual({ email: 'stuck@close.test', closed_at: null });
    expect(await count('SELECT COUNT(*) AS n FROM pro_clients WHERE account_id = ?', account.id)).toBe(2);

    await closeAccount(testEnv, account);
    expect(await count('SELECT COUNT(*) AS n FROM pro_clients WHERE account_id = ?', account.id)).toBe(0);
  });
});

describe('a closed cabinet', () => {
  it('gets no sign-in letter, its old links open nothing, and the address can register anew', async () => {
    const email = 'gone@close.test';
    const { account, session } = await signIn(email);
    const before = (await createLoginToken(testEnv.DB, email, TEST_REQUESTER)) as string;
    expect((await close(session, email)).status).toBe(204);
    const sent = (await letters(email)).length;

    expect((await call('POST', '/v1/pro/login', undefined, { email })).status).toBe(202);
    expect(await count('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?', email)).toBe(0);
    expect(await letters(email)).toHaveLength(sent);
    expect((await call('POST', '/v1/pro/login/peek', undefined, { token: before })).status).toBe(404);
    expect((await call('POST', '/v1/pro/session', undefined, { token: before })).status).toBe(400);

    expect((await call('POST', '/v1/pro/signup', undefined, { email, name: 'Снова', terms: true })).status).toBe(202);
    expect((await letters(email)).at(-1)?.subject).toBe('Подтвердите почту для Chronika Pro');
    const again = await signIn(email);
    expect(again.account.id).not.toBe(account.id);
    const me = await call('GET', '/v1/pro/me', again.session);
    expect(await me.json()).toMatchObject({ email, balance: 0, name: 'Test' });
  });

  it('is refused at sign-in, the link peek, the session and every route, by its closed_at alone', async () => {
    const email = 'flagged@close.test';
    const { account, session } = await signIn(email);
    const link = (await createLoginToken(testEnv.DB, email, TEST_REQUESTER)) as string;
    await testEnv.DB.prepare('UPDATE pro_accounts SET closed_at = ? WHERE id = ?').bind(new Date().toISOString(), account.id).run();

    const tokens = await count('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?', email);
    expect((await call('POST', '/v1/pro/login', undefined, { email })).status).toBe(202);
    expect(await count('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ?', email)).toBe(tokens);
    expect((await call('POST', '/v1/pro/login/peek', undefined, { token: link })).status).toBe(404);
    expect(await consumeLoginToken(testEnv.DB, (await createLoginToken(testEnv.DB, email, 'other')) as string)).toBeNull();
    expect((await call('GET', '/v1/pro/me', session)).status).toBe(401);
    const fresh = await issueSession(testEnv, account as ProAccount);
    expect((await call('GET', '/v1/pro/clients', fresh)).status).toBe(401);
  });
});
