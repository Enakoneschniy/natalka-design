/** Credit packs: the catalogue and the life of one purchase.
 *
 * A purchase is written `pending` before the seller goes to Stripe and settled by the webhook.
 * Settling flips the status and books the ledger entry in ONE batch (a transaction), and the
 * ledger insert is conditional on the row still being in the state it is leaving. So however often
 * or however concurrently Stripe repeats an event, the credits are booked at most once.
 */

import { now } from '../db';
import { balance } from './credits';

export type PackId = 'p10' | 'p30' | 'p100';

export const PACKS: Record<PackId, { credits: number; amount_minor: number; currency: 'EUR' }> = {
  p10: { credits: 10, amount_minor: 9900, currency: 'EUR' },
  p30: { credits: 30, amount_minor: 24900, currency: 'EUR' },
  p100: { credits: 100, amount_minor: 69000, currency: 'EUR' },
};

export const isPack = (value: unknown): value is PackId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PACKS, value);

/** A paid pack counts as refundable for this many days. */
export const REFUND_DAYS = 14;

export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PurchaseRow {
  id: string;
  account_id: string;
  pack: PackId;
  credits: number;
  amount_minor: number;
  currency: string;
  status: PurchaseStatus;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
}

export interface PurchaseView {
  id: string;
  pack: PackId;
  credits: number;
  amount_minor: number;
  currency: string;
  status: PurchaseStatus;
  created_at: string;
  paid_at: string | null;
  refundable: boolean;
}

const changes = (r: D1Result | undefined): number => r?.meta.changes ?? 0;

/** Unpaid checkouts a seller may have opened in the last hour; past them no new one is opened. */
export const PENDING_PURCHASES_PER_HOUR = 3;

/** Writes a pending purchase, or returns null when the seller already has
 * PENDING_PURCHASES_PER_HOUR purchases still pending from the last hour. The count and the insert
 * are one statement, so purchases asked for at once cannot pass the limit together. */
export async function createPurchase(
  db: D1Database,
  accountId: string,
  pack: PackId,
): Promise<PurchaseRow | null> {
  const p = PACKS[pack];
  const row: PurchaseRow = {
    id: crypto.randomUUID(),
    account_id: accountId,
    pack,
    credits: p.credits,
    amount_minor: p.amount_minor,
    currency: p.currency,
    status: 'pending',
    stripe_session_id: null,
    stripe_payment_intent: null,
    created_at: now(),
    paid_at: null,
    refunded_at: null,
  };
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const stored = await db
    .prepare(
      `INSERT INTO pro_purchases (id, account_id, pack, credits, amount_minor, currency, status, created_at)
       SELECT ?, ?, ?, ?, ?, ?, 'pending', ?
       WHERE (SELECT COUNT(*) FROM pro_purchases WHERE account_id = ? AND status = 'pending' AND created_at > ?) < ?`,
    )
    .bind(
      row.id,
      accountId,
      pack,
      row.credits,
      row.amount_minor,
      row.currency,
      row.created_at,
      accountId,
      hourAgo,
      PENDING_PURCHASES_PER_HOUR,
    )
    .run();
  return changes(stored) > 0 ? row : null;
}

export async function attachSession(
  db: D1Database,
  purchaseId: string,
  sessionId: string,
): Promise<void> {
  await db
    .prepare('UPDATE pro_purchases SET stripe_session_id = ? WHERE id = ?')
    .bind(sessionId, purchaseId)
    .run();
}

/** Settles a purchase Stripe says is paid. 'paid' only the one time that books the credits.
 * 'refunded' when Stripe reported a refund or a dispute of this payment before its completion
 * (a tombstone): the purchase is closed and books nothing. */
export async function markPaid(
  db: D1Database,
  entry: {
    purchaseId: string;
    accountId: string;
    paymentIntent: string | null;
    amountSubtotal: number;
    currency: string;
  },
): Promise<'paid' | 'already' | 'mismatch' | 'unknown' | 'refunded'> {
  const row = await db
    .prepare('SELECT status, credits, amount_minor, currency FROM pro_purchases WHERE id = ? AND account_id = ?')
    .bind(entry.purchaseId, entry.accountId)
    .first<{ status: PurchaseStatus; credits: number; amount_minor: number; currency: string }>();
  if (!row) return 'unknown';
  if (row.status !== 'pending') return 'already';

  if (
    entry.amountSubtotal !== row.amount_minor ||
    entry.currency.toLowerCase() !== row.currency.toLowerCase()
  ) {
    const res = await db
      .prepare("UPDATE pro_purchases SET status = 'failed' WHERE id = ? AND account_id = ? AND status = 'pending'")
      .bind(entry.purchaseId, entry.accountId)
      .run();
    return changes(res) > 0 ? 'mismatch' : 'already';
  }

  const at = now();
  const tombstone = 'EXISTS (SELECT 1 FROM stripe_tombstones WHERE payment_intent = ?)';
  // The ledger row goes in first, while the purchase is still pending and only if it is; the
  // status flip follows in the same transaction. A concurrent delivery finds nothing pending.
  const [, flip, closed] = await db.batch([
    db
      .prepare(
        `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
         SELECT ?, account_id, credits, 'purchase', id, ?
         FROM pro_purchases WHERE id = ? AND account_id = ? AND status = 'pending' AND NOT ${tombstone}
         ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
      )
      .bind(crypto.randomUUID(), at, entry.purchaseId, entry.accountId, entry.paymentIntent),
    db
      .prepare(
        `UPDATE pro_purchases SET status = 'paid', paid_at = ?, stripe_payment_intent = ?
         WHERE id = ? AND account_id = ? AND status = 'pending' AND NOT ${tombstone}`,
      )
      .bind(at, entry.paymentIntent, entry.purchaseId, entry.accountId, entry.paymentIntent),
    db
      .prepare(
        `UPDATE pro_purchases SET status = 'refunded', paid_at = ?, refunded_at = ?, stripe_payment_intent = ?
         WHERE id = ? AND account_id = ? AND status = 'pending' AND ${tombstone}`,
      )
      .bind(at, at, entry.paymentIntent, entry.purchaseId, entry.accountId, entry.paymentIntent),
  ]);
  if (changes(flip) > 0) return 'paid';
  return changes(closed) > 0 ? 'refunded' : 'already';
}

/** A disputed payment for a pack takes the pack's credits back, once per dispute. The purchase
 * keeps its status: the dispute may still be won. */
export async function disputePurchase(
  db: D1Database,
  entry: { paymentIntent: string; disputeId: string },
): Promise<'debited' | 'already' | 'unknown'> {
  const result = await db
    .prepare(
      `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       SELECT ?, account_id, -credits, 'adjust', ?, ?
       FROM pro_purchases WHERE stripe_payment_intent = ? AND status = 'paid'
       ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
    )
    .bind(crypto.randomUUID(), `dispute:${entry.disputeId}`, now(), entry.paymentIntent)
    .run();
  if (changes(result) > 0) return 'debited';
  return (await purchaseExists(db, entry.paymentIntent)) ? 'already' : 'unknown';
}

/** A dispute won gives back what it took, once, and only if it took something. */
export async function disputeWon(
  db: D1Database,
  entry: { paymentIntent: string; disputeId: string },
): Promise<'credited' | 'already' | 'unknown'> {
  const result = await db
    .prepare(
      `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       SELECT ?, account_id, credits, 'adjust', ?, ?
       FROM pro_purchases WHERE stripe_payment_intent = ?
         AND EXISTS (SELECT 1 FROM credit_ledger WHERE reason = 'adjust' AND ref = ?)
       ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
    )
    .bind(crypto.randomUUID(), `dispute_won:${entry.disputeId}`, now(), entry.paymentIntent, `dispute:${entry.disputeId}`)
    .run();
  if (changes(result) > 0) return 'credited';
  return (await purchaseExists(db, entry.paymentIntent)) ? 'already' : 'unknown';
}

const purchaseExists = async (db: D1Database, paymentIntent: string): Promise<boolean> =>
  Boolean(await db.prepare('SELECT 1 AS x FROM pro_purchases WHERE stripe_payment_intent = ?').bind(paymentIntent).first());

/** pending → failed, nothing else. */
export async function markFailed(db: D1Database, purchaseId: string, accountId: string): Promise<void> {
  await db
    .prepare("UPDATE pro_purchases SET status = 'failed' WHERE id = ? AND account_id = ? AND status = 'pending'")
    .bind(purchaseId, accountId)
    .run();
}

/** A full refund of a paid purchase: flips it and takes the credits back, once. */
export async function markRefunded(
  db: D1Database,
  paymentIntent: string,
): Promise<'refunded' | 'already' | 'unknown'> {
  const at = now();
  const [, flip] = await db.batch([
    db
      .prepare(
        `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
         SELECT ?, account_id, -credits, 'adjust', 'refund:' || id, ?
         FROM pro_purchases WHERE stripe_payment_intent = ? AND status = 'paid'
         ON CONFLICT (reason, ref) WHERE ref IS NOT NULL DO NOTHING`,
      )
      .bind(crypto.randomUUID(), at, paymentIntent),
    db
      .prepare(
        `UPDATE pro_purchases SET status = 'refunded', refunded_at = ?
         WHERE stripe_payment_intent = ? AND status = 'paid'`,
      )
      .bind(at, paymentIntent),
  ]);
  if (changes(flip) > 0) return 'refunded';
  const seen = await db
    .prepare('SELECT 1 AS x FROM pro_purchases WHERE stripe_payment_intent = ?')
    .bind(paymentIntent)
    .first();
  return seen ? 'already' : 'unknown';
}

/** The seller's purchases, newest first. `refundable` is advice for the owner, not a rule. */
export async function listPurchases(db: D1Database, accountId: string): Promise<PurchaseView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, pack, credits, amount_minor, currency, status, created_at, paid_at
       FROM pro_purchases WHERE account_id = ? ORDER BY created_at DESC, rowid DESC`,
    )
    .bind(accountId)
    .all<Omit<PurchaseView, 'refundable'>>();
  const current = await balance(db, accountId);
  const cutoff = Date.now() - REFUND_DAYS * 86_400_000;
  return results.map((r) => ({
    ...r,
    refundable:
      r.status === 'paid' &&
      r.paid_at !== null &&
      Date.parse(r.paid_at) >= cutoff &&
      current >= r.credits,
  }));
}
