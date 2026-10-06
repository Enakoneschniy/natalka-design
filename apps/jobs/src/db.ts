/** D1 access. Plain SQL: the schema is five tables and an ORM would only hide the retention rules. */

import type { Blobish } from './crypto';

export type Product = 'natal' | 'forecast' | 'synastry' | 'child' | 'bundle';
export type JobStep = 'calc' | 'texts' | 'pdf' | 'email' | 'done';
export type JobStatus = 'queued' | 'running' | 'failed' | 'done';

export interface OrderRow {
  id: string;
  email: string;
  product: Product;
  locale: string;
  country: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  /** Which side of the price experiment this order was shown. */
  variant: string | null;
  /** The visitor's answer to the cookie question, as it stood when they bought. */
  consent: string | null;
  /** Where they came from: utm_source, as it arrived. */
  source: string | null;
  created_at: string;
}

export interface JobRow {
  id: string;
  order_id: string;
  kind: Product;
  step: JobStep;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  /** Plain JSON, only in rows written before the payload was encrypted (see openPayload). */
  payload: string | null;
  payload_ct: Blobish | null;
  payload_nonce: Blobish | null;
  /** The plan's sections and how many of them are written, kept with the payload (sealPayload);
   * NULL in rows from before the counts were kept. */
  sections_planned: number | null;
  sections_written: number | null;
  tokens_in: number;
  tokens_out: number;
  cost_micros: number;
  model: string | null;
  /** Until when a queue delivery holds the job, and which message it is (see consumer.ts). */
  lease_until: string | null;
  lease_by: string | null;
  updated_at: string;
}

export const now = (): string => new Date().toISOString();

export const expiryFrom = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

export async function insertOrder(db: D1Database, order: OrderRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO orders (id, email, product, locale, country, amount_minor, currency, status,
                            variant, consent, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      order.id,
      order.email,
      order.product,
      order.locale,
      order.country,
      order.amount_minor,
      order.currency,
      order.status,
      order.variant,
      order.consent,
      order.source,
      order.created_at,
    )
    .run();
}

export async function insertChart(
  db: D1Database,
  chart: {
    id: string;
    order_id: string;
    /** 1 for the person the order is for, 2 for the partner in a synastry. */
    person_no?: 1 | 2;
    ciphertext: ArrayBuffer;
    nonce: ArrayBuffer;
    unknown_time: boolean;
    gender: string;
    expires_at: string;
  },
): Promise<void> {
  // The name and the place live in the ciphertext only; display_name and place_label stay empty.
  await db
    .prepare(
      `INSERT INTO charts (id, order_id, person_no, birth_ciphertext, birth_nonce, key_version,
                           unknown_time, gender, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .bind(
      chart.id,
      chart.order_id,
      chart.person_no ?? 1,
      chart.ciphertext,
      chart.nonce,
      chart.unknown_time ? 1 : 0,
      chart.gender,
      chart.expires_at,
      now(),
    )
    .run();
}

export async function insertJob(
  db: D1Database,
  job: { id: string; order_id: string; kind: Product },
): Promise<void> {
  const ts = now();
  await db
    .prepare(
      `INSERT INTO jobs (id, order_id, kind, step, status, created_at, updated_at)
       VALUES (?, ?, ?, 'calc', 'queued', ?, ?)`,
    )
    .bind(job.id, job.order_id, job.kind, ts, ts)
    .run();
}

export const getJob = (db: D1Database, id: string): Promise<JobRow | null> =>
  db.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<JobRow>();

export async function updateJob(
  db: D1Database,
  id: string,
  patch: Partial<
    Pick<
      JobRow,
      | 'step'
      | 'status'
      | 'attempts'
      | 'last_error'
      | 'payload'
      | 'payload_ct'
      | 'payload_nonce'
      | 'sections_planned'
      | 'sections_written'
      | 'tokens_in'
      | 'tokens_out'
      | 'cost_micros'
      | 'model'
    >
  >,
): Promise<void> {
  const columns = Object.keys(patch);
  if (columns.length === 0) return;
  const assignments = columns.map((c) => `${c} = ?`).join(', ');
  await db
    .prepare(`UPDATE jobs SET ${assignments}, updated_at = ? WHERE id = ?`)
    .bind(...columns.map((c) => patch[c as keyof typeof patch] ?? null), now(), id)
    .run();
}

export async function insertDocument(
  db: D1Database,
  doc: {
    id: string;
    order_id: string;
    storage_key: string;
    sha256: string;
    pages: number;
    bytes: number;
    lang: string;
    expires_at: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO documents (id, order_id, storage_key, sha256, pages, bytes, lang, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      doc.id,
      doc.order_id,
      doc.storage_key,
      doc.sha256,
      doc.pages,
      doc.bytes,
      doc.lang,
      doc.expires_at,
      now(),
    )
    .run();
}

export const documentForOrder = (db: D1Database, orderId: string) =>
  db
    .prepare('SELECT * FROM documents WHERE order_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(orderId)
    .first<{ id: string; storage_key: string; expires_at: string; pages: number }>();

/** A shopper's job keeps the calculated chart (birth date, time and place) and every text written
 * from it. Past the retention date both go, like the charts and the PDF; the order and the cost
 * stay for accounting. A seller's reading is kept on purpose: it belongs to their client base. */
export async function scrubExpiredJobPayloads(db: D1Database, days: number): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE jobs SET payload = NULL, payload_ct = NULL, payload_nonce = NULL
       WHERE (payload IS NOT NULL OR payload_ct IS NOT NULL)
         AND order_id IN (SELECT id FROM orders WHERE pro_account_id IS NULL AND created_at < ?)`,
    )
    .bind(expiryFrom(-days))
    .run();
  return result.meta.changes ?? 0;
}

export interface PreviewRow {
  key: string;
  lang: string;
  blocks: string;
}

export const cachedPreview = (db: D1Database, key: string) =>
  db
    .prepare('SELECT key, lang, blocks FROM previews WHERE key = ? AND expires_at > ?')
    .bind(key, now())
    .first<PreviewRow>();

export async function cachePreview(
  db: D1Database,
  entry: { key: string; lang: string; blocks: string; cost_micros: number; model: string },
  days: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO previews (key, lang, blocks, cost_micros, model, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.key,
      entry.lang,
      entry.blocks,
      entry.cost_micros,
      entry.model,
      now(),
      expiryFrom(days),
    )
    .run();
}

/** The few fields the counters need when an order is paid for. */
export const orderFacts = (db: D1Database, id: string) =>
  db
    .prepare(
      'SELECT variant, consent, source, country, currency, amount_minor, product FROM orders WHERE id = ?',
    )
    .bind(id)
    .first<{
      variant: string | null;
      consent: string | null;
      source: string | null;
      country: string | null;
      currency: string;
      amount_minor: number;
      product: string;
    }>();

export async function orderContact(
  db: D1Database,
  orderId: string,
): Promise<{ email: string; locale: string } | null> {
  return db
    .prepare('SELECT email, locale FROM orders WHERE id = ?')
    .bind(orderId)
    .first<{ email: string; locale: string }>();
}

export async function insertEmailEvent(
  db: D1Database,
  event: { order_id: string; kind: string; provider_id: string | null; status: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_events (id, order_id, kind, provider_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), event.order_id, event.kind, event.provider_id, event.status, now())
    .run();
}

export interface TelegramLink {
  code: string;
  order_id: string;
  job_id: string;
  locale: string;
  chat_id: number | null;
  delivered_at: string | null;
}

/** Letters and digits that survive a Telegram start parameter and a phone keyboard: no 0/O, 1/l/I. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** One byte of entropy per character, drawn until it falls under the largest multiple of the
 * alphabet size — no modulo bias, and sixteen characters are ninety bits. */
function randomCode(length: number): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && out.length < length) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** A link code lives as long as the order's link token: thirty days from when it was made. */
export const TELEGRAM_LINK_DAYS = 30;

/** The code for a job's deep link — the same one every time it is asked for, while it lives. */
export async function telegramCodeFor(
  db: D1Database,
  link: { order_id: string; job_id: string; locale: string },
): Promise<string> {
  const existing = await db
    .prepare('SELECT code FROM telegram_links WHERE job_id = ? AND created_at > ?')
    .bind(link.job_id, expiryFrom(-TELEGRAM_LINK_DAYS))
    .first<{ code: string }>();
  if (existing) return existing.code;
  const code = randomCode(16);
  await db
    .prepare(
      `INSERT INTO telegram_links (code, order_id, job_id, locale, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(code, link.order_id, link.job_id, link.locale, now())
    .run();
  return code;
}

/** The link behind a code, while it lives. */
export async function telegramLink(db: D1Database, code: string): Promise<TelegramLink | null> {
  return db
    .prepare(
      `SELECT code, order_id, job_id, locale, chat_id, delivered_at FROM telegram_links
       WHERE code = ? AND created_at > ?`,
    )
    .bind(code, expiryFrom(-TELEGRAM_LINK_DAYS))
    .first<TelegramLink>();
}

/** Binds a code to the chat that opened it first. A code already bound to another chat stays
 * with it: whoever else has the code gets nothing. Returns whether this chat holds it. */
export async function claimTelegramLink(db: D1Database, code: string, chatId: number): Promise<boolean> {
  const result = await db
    .prepare('UPDATE telegram_links SET chat_id = ? WHERE code = ? AND (chat_id IS NULL OR chat_id = ?)')
    .bind(chatId, code, chatId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markTelegramDelivered(db: D1Database, code: string): Promise<void> {
  await db
    .prepare('UPDATE telegram_links SET delivered_at = ? WHERE code = ?')
    .bind(now(), code)
    .run();
}

/** Chats still waiting for an order's document. */
export async function telegramWaiting(db: D1Database, orderId: string): Promise<TelegramLink[]> {
  const { results } = await db
    .prepare(
      `SELECT code, order_id, job_id, locale, chat_id, delivered_at FROM telegram_links
       WHERE order_id = ? AND chat_id IS NOT NULL AND delivered_at IS NULL`,
    )
    .bind(orderId)
    .all<TelegramLink>();
  return results;
}

export async function forgetTelegramChat(db: D1Database, chatId: number): Promise<void> {
  await db.prepare('DELETE FROM telegram_links WHERE chat_id = ?').bind(chatId).run();
}

const changed = (result: D1Result | undefined): boolean => (result?.meta.changes ?? 0) > 0;

export type Settlement = 'paid' | 'mismatch' | 'refunded' | 'disputed' | 'already' | 'second_payment' | 'unknown';

/** Settles a shopper's order that Stripe says is paid. 'paid' only the one time the order flips,
 * however often or concurrently the event is delivered: then, and only then, is it written.
 *
 * The amount and currency must be the order's own; anything else holds the order and pays for
 * nothing. A refund or a dispute that Stripe delivered before this completion (it does not
 * promise the order of events) is found as a tombstone, and the order is closed accordingly. */
export async function settleOrderPayment(
  db: D1Database,
  payment: { orderId: string; paymentIntent: string | null; amountSubtotal?: number; currency?: string },
): Promise<Settlement> {
  const order = await orderState(db, payment.orderId);
  if (!order || order.pro_account_id) return 'unknown';
  if (order.status !== 'pending' || order.hold) {
    const another = payment.paymentIntent && order.stripe_payment_intent && payment.paymentIntent !== order.stripe_payment_intent;
    return another ? 'second_payment' : 'already';
  }
  const pi = payment.paymentIntent;
  if (
    payment.amountSubtotal !== order.amount_minor ||
    (payment.currency ?? '').toLowerCase() !== order.currency.toLowerCase()
  ) {
    const held = await db
      .prepare(
        `UPDATE orders SET hold = 'amount_mismatch', stripe_payment_intent = ?
         WHERE id = ? AND status = 'pending' AND hold IS NULL`,
      )
      .bind(pi, payment.orderId)
      .run();
    return changed(held) ? 'mismatch' : 'already';
  }
  const at = now();
  const open = `id = ? AND status = 'pending' AND hold IS NULL`;
  const [paid, refunded, disputed] = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status = 'paid', paid_at = ?, stripe_payment_intent = ?
         WHERE ${open} AND NOT EXISTS (SELECT 1 FROM stripe_tombstones WHERE payment_intent = ?)`,
      )
      .bind(at, pi, payment.orderId, pi),
    db
      .prepare(
        `UPDATE orders SET status = 'refunded', paid_at = ?, stripe_payment_intent = ?
         WHERE ${open} AND EXISTS (SELECT 1 FROM stripe_tombstones WHERE payment_intent = ? AND kind = 'refund')`,
      )
      .bind(at, pi, payment.orderId, pi),
    db
      .prepare(
        `UPDATE orders SET status = 'paid', hold = 'disputed', paid_at = ?, stripe_payment_intent = ?
         WHERE ${open} AND EXISTS (SELECT 1 FROM stripe_tombstones WHERE payment_intent = ? AND kind = 'dispute')`,
      )
      .bind(at, pi, payment.orderId, pi),
  ]);
  if (changed(paid)) return 'paid';
  if (changed(refunded)) return 'refunded';
  return changed(disputed) ? 'disputed' : 'already';
}

/** A full refund of a shopper's payment. A paid order becomes refunded, and so does one held for
 * the wrong amount, which is what the owner refunds it for. */
export async function refundOrder(db: D1Database, paymentIntent: string): Promise<'refunded' | 'already' | 'unknown'> {
  const result = await db
    .prepare(
      `UPDATE orders SET status = 'refunded', hold = NULLIF(hold, 'amount_mismatch')
       WHERE stripe_payment_intent = ? AND pro_account_id IS NULL
         AND (status = 'paid' OR (status = 'pending' AND hold = 'amount_mismatch'))`,
    )
    .bind(paymentIntent)
    .run();
  if (changed(result)) return 'refunded';
  const seen = await db
    .prepare('SELECT 1 AS yes FROM orders WHERE stripe_payment_intent = ? AND pro_account_id IS NULL')
    .bind(paymentIntent)
    .first();
  return seen ? 'already' : 'unknown';
}

/** Holds a shopper's order while its payment is disputed, or lets it go once no dispute of the
 * payment is listed any more (see recordDispute). An order held for the wrong amount keeps that
 * hold. The shopper's order with this payment and its hold after, or null when there is none. */
export async function setDisputeHold(
  db: D1Database,
  paymentIntent: string,
  disputed: boolean,
): Promise<{ id: string; hold: OrderState['hold'] } | null> {
  await (
    disputed
      ? db
          .prepare(
            `UPDATE orders SET hold = 'disputed'
             WHERE stripe_payment_intent = ? AND pro_account_id IS NULL AND hold IS NULL`,
          )
          .bind(paymentIntent)
      : db
          .prepare(
            `UPDATE orders SET hold = NULL
             WHERE stripe_payment_intent = ? AND pro_account_id IS NULL AND hold = 'disputed'
               AND NOT EXISTS (SELECT 1 FROM stripe_tombstones WHERE payment_intent = ? AND kind = 'dispute')`,
          )
          .bind(paymentIntent, paymentIntent)
  ).run();
  return db
    .prepare('SELECT id, hold FROM orders WHERE stripe_payment_intent = ? AND pro_account_id IS NULL')
    .bind(paymentIntent)
    .first<{ id: string; hold: OrderState['hold'] }>();
}

/** Remembers that Stripe refunded a payment, whether or not it is known here yet: a completion
 * delivered after it then books nothing. */
export async function recordRefund(db: D1Database, paymentIntent: string, chargeId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stripe_tombstones (payment_intent, kind, ref, created_at) VALUES (?, 'refund', ?, ?)
       ON CONFLICT (payment_intent, kind) DO NOTHING`,
    )
    .bind(paymentIntent, chargeId, now())
    .run();
}

/** Remembers a dispute of a payment, whether or not the payment is known here yet. The payment's
 * dispute tombstone lists, space-separated, its disputes that have not been won: a completion
 * delivered after them books the payment as disputed, and a shopper's order stays held while any
 * is listed. A dispute lost stays listed. Returns the list, this dispute included. */
export async function recordDispute(db: D1Database, paymentIntent: string, disputeId: string): Promise<string[]> {
  const [, listed] = await db.batch([
    db
      .prepare(
        `INSERT INTO stripe_tombstones (payment_intent, kind, ref, created_at) VALUES (?, 'dispute', ?, ?)
         ON CONFLICT (payment_intent, kind) DO UPDATE SET ref = ref || ' ' || excluded.ref
           WHERE instr(' ' || ref || ' ', ' ' || excluded.ref || ' ') = 0`,
      )
      .bind(paymentIntent, disputeId, now()),
    db.prepare("SELECT ref FROM stripe_tombstones WHERE payment_intent = ? AND kind = 'dispute'").bind(paymentIntent),
  ]);
  const ref = (listed?.results[0] as { ref?: string } | undefined)?.ref ?? '';
  return ref.split(' ').filter(Boolean);
}

/** A dispute won, or an inquiry closed, leaves its payment's list; the tombstone goes with the
 * last one. */
export async function dropDispute(db: D1Database, paymentIntent: string, disputeId: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE stripe_tombstones SET ref = trim(replace(' ' || ref || ' ', ' ' || ? || ' ', ' '))
         WHERE payment_intent = ? AND kind = 'dispute'`,
      )
      .bind(disputeId, paymentIntent),
    db.prepare("DELETE FROM stripe_tombstones WHERE payment_intent = ? AND kind = 'dispute' AND ref = ''").bind(paymentIntent),
  ]);
}

/** Records the order's current Checkout Session and when it was opened; an unpaid order is swept a
 * week after its last one. */
export async function setOrderSession(db: D1Database, orderId: string, sessionId: string) {
  await db
    .prepare('UPDATE orders SET stripe_session_id = ?, checkout_at = ? WHERE id = ?')
    .bind(sessionId, now(), orderId)
    .run();
}

/** What the site is told about an order. The stored status holds pending, paid, test and
 * refunded; a dispute or a payment of the wrong amount is a hold beside it (see migration 0014). */
export type OrderStatus = 'pending' | 'paid' | 'test' | 'refunded' | 'disputed' | 'failed';

export interface OrderState {
  id: string;
  email: string;
  product: Product;
  locale: string;
  amount_minor: number;
  currency: string;
  status: 'pending' | 'paid' | 'test' | 'refunded';
  hold: 'amount_mismatch' | 'disputed' | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  pro_account_id: string | null;
}

export const orderState = (db: D1Database, orderId: string): Promise<OrderState | null> =>
  db
    .prepare(
      `SELECT id, email, product, locale, amount_minor, currency, status, hold, stripe_session_id,
              stripe_payment_intent, pro_account_id
       FROM orders WHERE id = ?`,
    )
    .bind(orderId)
    .first<OrderState>();

export function orderStatusOf(order: Pick<OrderState, 'status' | 'hold'>): OrderStatus {
  if (order.hold === 'disputed') return 'disputed';
  if (order.hold === 'amount_mismatch') return 'failed';
  return order.status;
}

/** Whether the order's document may be handed out: it was paid for (or is a test) and nothing
 * has taken the payment back. */
export const deliverable = (status: OrderStatus): boolean => status === 'paid' || status === 'test';

// ---- what the site is doing -----------------------------------------------------------------

export interface StatKey {
  event: string;
  variant?: string | null;
  angle?: string | null;
  source?: string | null;
  country?: string | null;
  currency?: string | null;
  /** Money, for the events that carry any. */
  amountMinor?: number;
}

/** One row per combination per day, bumped in place.
 *
 * Aggregates, written from the request that caused them: nobody is followed between two of
 * these, and there is nothing in a row that points at a person. A failure here must never cost
 * a visitor their page, so the caller runs it after the response has gone.
 */
export async function bumpStat(db: D1Database, key: StatKey): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .prepare(
      `INSERT INTO stats (day, event, variant, angle, source, country, currency, count, amount_minor)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (day, event, variant, angle, source, country, currency)
       DO UPDATE SET count = count + 1, amount_minor = amount_minor + excluded.amount_minor`,
    )
    .bind(
      day,
      key.event,
      key.variant ?? '',
      key.angle ?? '',
      key.source ?? '',
      (key.country ?? '').toUpperCase(),
      key.currency ?? '',
      key.amountMinor ?? 0,
    )
    .run();
}
