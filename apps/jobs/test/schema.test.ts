import { describe, expect, it } from 'vitest';
import { testEnv } from './env';

const db = () => testEnv.DB;
const ts = '2026-10-03T00:00:00.000Z';

async function account(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .prepare('INSERT INTO pro_accounts (id, email, created_at) VALUES (?, ?, ?)')
    .bind(id, email, ts)
    .run();
  return id;
}

describe('0008 pro schema', () => {
  it('keeps one account per email', async () => {
    await account('one@schema.test');
    await expect(account('one@schema.test')).rejects.toThrow(/UNIQUE/);
  });

  it('defaults tone to vy and epoch to 0', async () => {
    const id = await account('defaults@schema.test');
    const row = await db()
      .prepare('SELECT tone, session_epoch FROM pro_accounts WHERE id = ?')
      .bind(id)
      .first<{ tone: string; session_epoch: number }>();
    expect(row).toEqual({ tone: 'vy', session_epoch: 0 });
  });

  it('refuses a zero ledger entry and an unknown reason', async () => {
    const id = await account('ledger@schema.test');
    const insert = (delta: number, reason: string) =>
      db()
        .prepare(
          'INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
        )
        .bind(crypto.randomUUID(), id, delta, reason, ts)
        .run();
    await expect(insert(0, 'adjust')).rejects.toThrow(/CHECK/);
    await expect(insert(1, 'gift')).rejects.toThrow(/CHECK/);
    await insert(1, 'adjust');
  });

  it('records a (reason, ref) pair once', async () => {
    const id = await account('once@schema.test');
    const insert = () =>
      db()
        .prepare(
          "INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at) VALUES (?, ?, 10, 'purchase', 'cs_once', ?)",
        )
        .bind(crypto.randomUUID(), id, ts)
        .run();
    await insert();
    await expect(insert()).rejects.toThrow(/UNIQUE/);
  });

  it('stores invite codes in upper case only', async () => {
    const insert = (code: string) =>
      db()
        .prepare(
          'INSERT INTO pro_invite_codes (code, credits, max_uses, created_at) VALUES (?, 3, 10, ?)',
        )
        .bind(code, ts)
        .run();
    await expect(insert('lower')).rejects.toThrow(/CHECK/);
    await insert('UPPER');
  });
});
