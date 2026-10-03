/** Credits: what a seller has paid for and not yet spent.
 *
 * A ledger, not a counter. Each entry is booked once per cause — (reason, ref) is unique — so a
 * webhook delivered twice or a retried job cannot book twice. A spend is one INSERT whose SELECT
 * only yields a row while the balance covers it; SQLite runs it as a single write, so two spends
 * racing for the last credit cannot both land.
 */

import { now, type Product } from '../db';

export const CREDIT_COST: Record<Product, number> = {
  natal: 1,
  forecast: 1,
  synastry: 1,
  child: 1,
  bundle: 2,
};

export type CreditReason = 'purchase' | 'trial' | 'report' | 'refund' | 'adjust';

export async function balance(db: D1Database, accountId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE account_id = ?')
    .bind(accountId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Adds (or, for an adjustment, removes) credits. False when this cause was already booked. */
export async function grant(
  db: D1Database,
  entry: {
    accountId: string;
    delta: number;
    reason: Exclude<CreditReason, 'report' | 'refund'>;
    ref: string | null;
  },
): Promise<boolean> {
  if (!Number.isInteger(entry.delta) || entry.delta === 0) {
    throw new RangeError('delta must be a non-zero whole number');
  }
  if (entry.delta < 0 && entry.reason !== 'adjust') {
    throw new RangeError('only an adjustment can take credits away');
  }
  const result = await db
    .prepare(
      `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
    )
    .bind(crypto.randomUUID(), entry.accountId, entry.delta, entry.reason, entry.ref, now())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Takes `amount` credits for the job named by `ref`. False when the balance is short or the job
 * has already paid. */
export async function spend(
  db: D1Database,
  entry: { accountId: string; amount: number; ref: string },
): Promise<boolean> {
  if (!Number.isInteger(entry.amount) || entry.amount <= 0) return false;
  const result = await db
    .prepare(
      `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       SELECT ?, ?, ?, 'report', ?, ?
       WHERE (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE account_id = ?) >= ?
       ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(),
      entry.accountId,
      -entry.amount,
      entry.ref,
      now(),
      entry.accountId,
      entry.amount,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** The refund as a statement, for callers that book it together with other writes in one batch. */
export function refundStatement(db: D1Database, ref: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       SELECT ?, account_id, -delta, 'refund', ref, ?
       FROM credit_ledger WHERE reason = 'report' AND ref = ?
       ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
    )
    .bind(crypto.randomUUID(), now(), ref);
}

/** Gives back what the job named by `ref` took. False when it took nothing or was refunded. */
export async function refund(db: D1Database, ref: string): Promise<boolean> {
  const result = await refundStatement(db, ref).run();
  return (result.meta.changes ?? 0) > 0;
}
