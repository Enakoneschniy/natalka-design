import { describe, expect, it } from 'vitest';
import { createClient } from '../src/pro/clients';
import { balance, grant } from '../src/pro/credits';
import { createReading, deleteClient, listReadings, readingRow, readingView } from '../src/pro/readings';
import { ANNA } from './people';
import { runJob, signIn, testEnv } from './env';

async function seller(name: string, credits = 5) {
  const { account } = await signIn(`${name}@readings.test`);
  if (credits) await grant(testEnv.DB, { accountId: account.id, delta: credits, reason: 'adjust', ref: null });
  const clientId = await createClient(testEnv, account.id, { ...ANNA, name: `Клиент ${name}` });
  return { account, clientId };
}

const jobOf = async (orderId: string) =>
  (await testEnv.DB.prepare('SELECT job_id FROM pro_readings WHERE order_id = ?').bind(orderId).first<{ job_id: string }>())
    ?.job_id as string;

describe('createReading', () => {
  it('spends the credits and queues a reading about the client', async () => {
    const { account, clientId } = await seller('natal');
    const result = await createReading(testEnv, account, { product: 'natal', client_id: clientId });
    expect(result.status).toBe('created');
    expect(await balance(testEnv.DB, account.id)).toBe(4);
    const id = (result as { id: string }).id;
    const order = await testEnv.DB.prepare('SELECT status, currency, amount_minor, pro_account_id FROM orders WHERE id = ?')
      .bind(id)
      .first();
    expect(order).toEqual({ status: 'paid', currency: 'credit', amount_minor: 1, pro_account_id: account.id });
    const chart = await testEnv.DB.prepare('SELECT expires_at FROM charts WHERE order_id = ?').bind(id).first();
    expect(chart).toEqual({ expires_at: '9999-12-31T23:59:59.999Z' });
  });

  it('charges two credits for a bundle', async () => {
    const { account, clientId } = await seller('bundle');
    await createReading(testEnv, account, { product: 'bundle', client_id: clientId });
    expect(await balance(testEnv.DB, account.id)).toBe(3);
  });

  it('refuses without enough credits and spends nothing', async () => {
    const { account, clientId } = await seller('poor', 1);
    expect(await createReading(testEnv, account, { product: 'bundle', client_id: clientId })).toEqual({
      status: 'insufficient',
      balance: 1,
    });
    expect(await balance(testEnv.DB, account.id)).toBe(1);
  });

  it('makes one reading of two taps on the last credit', async () => {
    const { account, clientId } = await seller('double', 1);
    const results = await Promise.all([
      createReading(testEnv, account, { product: 'natal', client_id: clientId }),
      createReading(testEnv, account, { product: 'natal', client_id: clientId }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['created', 'insufficient']);
    expect(await balance(testEnv.DB, account.id)).toBe(0);
  });

  it('needs a partner for a synastry and refuses one otherwise', async () => {
    const { account, clientId } = await seller('pairs');
    const partner = await createClient(testEnv, account.id, { ...ANNA, name: 'Партнёр' });
    expect((await createReading(testEnv, account, { product: 'synastry', client_id: clientId })).status).toBe('invalid');
    expect(
      (await createReading(testEnv, account, { product: 'synastry', client_id: clientId, partner_client_id: clientId }))
        .status,
    ).toBe('invalid');
    expect(
      (await createReading(testEnv, account, { product: 'natal', client_id: clientId, partner_client_id: partner }))
        .status,
    ).toBe('invalid');
    const ok = await createReading(testEnv, account, {
      product: 'synastry',
      client_id: clientId,
      partner_client_id: partner,
    });
    expect(ok.status).toBe('created');
    const charts = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM charts WHERE order_id = ?')
      .bind((ok as { id: string }).id)
      .first();
    expect(charts).toEqual({ n: 2 });
  });

  it("refuses an unknown product and another seller's client", async () => {
    const { account } = await seller('rules');
    const other = await seller('other');
    expect((await createReading(testEnv, account, { product: 'tarot', client_id: other.clientId })).status).toBe(
      'invalid',
    );
    expect((await createReading(testEnv, account, { product: 'natal', client_id: other.clientId })).status).toBe(
      'invalid',
    );
    expect(await balance(testEnv.DB, account.id)).toBe(5);
  });
});

describe('reading view', () => {
  it('says writing, then ready with every section in plan order', async () => {
    const { account, clientId } = await seller('view');
    const { id } = (await createReading(testEnv, account, { product: 'natal', client_id: clientId })) as { id: string };
    const before = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(before).toMatchObject({ status: 'writing', written: 0, total: 0, pdf: 'none', regenerations_left: 10 });

    await runJob(await jobOf(id));
    const after = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(after).toMatchObject({ status: 'ready', written: 3, total: 3, missing: [], frozen: false });
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it("hides one seller's reading from another", async () => {
    const { account, clientId } = await seller('mine');
    const stranger = await seller('theirs');
    const { id } = (await createReading(testEnv, account, { product: 'natal', client_id: clientId })) as { id: string };
    expect(await readingRow(testEnv.DB, id, stranger.account.id)).toBeNull();
  });

  it("lists a seller's readings, and a client's", async () => {
    const { account, clientId } = await seller('lists');
    const second = await createClient(testEnv, account.id, { ...ANNA, name: 'Вторая' });
    await createReading(testEnv, account, { product: 'natal', client_id: clientId });
    await createReading(testEnv, account, { product: 'forecast', client_id: second });
    expect((await listReadings(testEnv, account.id)).map((r) => r.product)).toEqual(['forecast', 'natal']);
    expect((await listReadings(testEnv, account.id, second)).map((r) => r.product)).toEqual(['forecast']);
  });
});

describe('deleteClient', () => {
  it('takes every reading the client is in, as client or partner, with its PDF', async () => {
    const { account, clientId } = await seller('gone');
    const partner = await createClient(testEnv, account.id, { ...ANNA, name: 'Уходит' });
    const own = (await createReading(testEnv, account, { product: 'natal', client_id: partner })) as { id: string };
    const pair = (await createReading(testEnv, account, {
      product: 'synastry',
      client_id: clientId,
      partner_client_id: partner,
    })) as { id: string };
    const kept = (await createReading(testEnv, account, { product: 'natal', client_id: clientId })) as { id: string };
    await testEnv.DOCS.put(`${pair.id}/synastry-ru.pdf`, 'pdf');
    await testEnv.DB.prepare(
      `INSERT INTO documents (id, order_id, storage_key, sha256, pages, bytes, lang, expires_at, created_at)
       VALUES (?, ?, ?, 'x', 1, 3, 'ru', '2999-01-01T00:00:00.000Z', '2026-10-03T00:00:00.000Z')`,
    )
      .bind(crypto.randomUUID(), pair.id, `${pair.id}/synastry-ru.pdf`)
      .run();

    expect(await deleteClient(testEnv, account.id, partner)).toBe(true);

    for (const id of [own.id, pair.id]) {
      expect(await testEnv.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(id).first()).toBeNull();
    }
    expect(await testEnv.DOCS.get(`${pair.id}/synastry-ru.pdf`)).toBeNull();
    expect(await readingRow(testEnv.DB, kept.id, account.id)).not.toBeNull();
    expect(await balance(testEnv.DB, account.id)).toBe(2);
  });

  it("refuses another seller's client", async () => {
    const owner = await seller('keeper');
    const stranger = await seller('intruder');
    expect(await deleteClient(testEnv, stranger.account.id, owner.clientId)).toBe(false);
  });
});
