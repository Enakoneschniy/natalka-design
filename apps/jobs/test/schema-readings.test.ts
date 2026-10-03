import { describe, expect, it } from 'vitest';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const ts = '2026-10-03T00:00:00.000Z';

async function sellerWithClient(name: string) {
  const { account } = await signIn(`${name}@schema2.test`);
  const clientId = crypto.randomUUID();
  await db()
    .prepare(
      'INSERT INTO pro_clients (id, account_id, birth_ciphertext, birth_nonce, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(clientId, account.id, new Uint8Array([1]), new Uint8Array([2]), ts, ts)
    .run();
  const orderId = crypto.randomUUID();
  await db()
    .prepare(
      `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at)
       VALUES (?, ?, 'natal', 'ru', 1, 'credit', 'paid', ?, ?)`,
    )
    .bind(orderId, account.email, account.id, ts)
    .run();
  await db()
    .prepare(
      `INSERT INTO pro_readings (order_id, account_id, job_id, client_id, editable_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(orderId, account.id, crypto.randomUUID(), clientId, ts, ts)
    .run();
  return { accountId: account.id, clientId, orderId };
}

describe('0009 pro readings schema', () => {
  it('lets a B2C order carry no seller', async () => {
    await db()
      .prepare(
        `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, created_at)
         VALUES (?, 'b2c@schema2.test', 'natal', 'ru', 1900, 'EUR', 'pending', ?)`,
      )
      .bind(crypto.randomUUID(), ts)
      .run();
  });

  it('refuses an order for a seller who does not exist', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at)
           VALUES (?, 'x@schema2.test', 'natal', 'ru', 1, 'credit', 'paid', 'nobody', ?)`,
        )
        .bind(crypto.randomUUID(), ts)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('starts a reading with no regenerations used', async () => {
    const { orderId } = await sellerWithClient('fresh');
    const row = await db()
      .prepare('SELECT regenerations, refunded_at, partner_client_id FROM pro_readings WHERE order_id = ?')
      .bind(orderId)
      .first();
    expect(row).toEqual({ regenerations: 0, refunded_at: null, partner_client_id: null });
  });

  it('removes the reading with its order, and only then lets the client go', async () => {
    const { clientId, orderId } = await sellerWithClient('cascade');
    await expect(db().prepare('DELETE FROM pro_clients WHERE id = ?').bind(clientId).run()).rejects.toThrow(
      /FOREIGN KEY/,
    );
    await db().prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
    const left = await db().prepare('SELECT COUNT(*) AS n FROM pro_readings WHERE order_id = ?').bind(orderId).first();
    expect(left).toEqual({ n: 0 });
    await db().prepare('DELETE FROM pro_clients WHERE id = ?').bind(clientId).run();
  });
});
