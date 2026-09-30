/** D1 access. Plain SQL: the schema is five tables and an ORM would only hide the retention rules. */

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
  payload: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_micros: number;
  model: string | null;
}

export const now = (): string => new Date().toISOString();

export const expiryFrom = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

export async function insertOrder(db: D1Database, order: OrderRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO orders (id, email, product, locale, country, amount_minor, currency, status, variant, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    display_name: string;
    place_label: string;
    expires_at: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO charts (id, order_id, person_no, birth_ciphertext, birth_nonce, key_version,
                           unknown_time, gender, display_name, place_label, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      chart.id,
      chart.order_id,
      chart.person_no ?? 1,
      chart.ciphertext,
      chart.nonce,
      chart.unknown_time ? 1 : 0,
      chart.gender,
      chart.display_name,
      chart.place_label,
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
  patch: Partial<Pick<JobRow, 'step' | 'status' | 'attempts' | 'last_error' | 'payload' | 'tokens_in' | 'tokens_out' | 'cost_micros' | 'model'>>,
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

/** Everything past its retention date, so the sweep can delete the objects before the rows. */
export const expired = (db: D1Database) =>
  db
    .prepare('SELECT id, order_id, storage_key FROM documents WHERE expires_at < ?')
    .bind(now())
    .all<{ id: string; order_id: string; storage_key: string }>();

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
    .prepare('SELECT variant, country, currency, amount_minor, product FROM orders WHERE id = ?')
    .bind(id)
    .first<{
      variant: string | null;
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

/** The code for a job's deep link — the same one every time it is asked for. */
export async function telegramCodeFor(
  db: D1Database,
  link: { order_id: string; job_id: string; locale: string },
): Promise<string> {
  const existing = await db
    .prepare('SELECT code FROM telegram_links WHERE job_id = ?')
    .bind(link.job_id)
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

export async function telegramLink(db: D1Database, code: string): Promise<TelegramLink | null> {
  return db
    .prepare(
      'SELECT code, order_id, job_id, locale, chat_id, delivered_at FROM telegram_links WHERE code = ?',
    )
    .bind(code)
    .first<TelegramLink>();
}

export async function claimTelegramLink(db: D1Database, code: string, chatId: number) {
  await db
    .prepare('UPDATE telegram_links SET chat_id = ? WHERE code = ?')
    .bind(chatId, code)
    .run();
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

export async function markOrderPaid(
  db: D1Database,
  orderId: string,
  paymentIntent: string | null,
): Promise<boolean> {
  // Returns whether this call was the one that flipped it: the webhook can arrive twice.
  const result = await db
    .prepare(
      `UPDATE orders SET status = 'paid', paid_at = ?, stripe_payment_intent = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(now(), paymentIntent, orderId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function setOrderSession(db: D1Database, orderId: string, sessionId: string) {
  await db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').bind(sessionId, orderId).run();
}

export async function orderStatus(db: D1Database, orderId: string): Promise<string | null> {
  const row = await db.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first<{ status: string }>();
  return row?.status ?? null;
}

// ---- what the site is doing -----------------------------------------------------------------

export interface StatKey {
  event: string;
  variant?: string | null;
  angle?: string | null;
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
      `INSERT INTO stats (day, event, variant, angle, country, currency, count, amount_minor)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (day, event, variant, angle, country, currency)
       DO UPDATE SET count = count + 1, amount_minor = amount_minor + excluded.amount_minor`,
    )
    .bind(
      day,
      key.event,
      key.variant ?? '',
      key.angle ?? '',
      (key.country ?? '').toUpperCase(),
      key.currency ?? '',
      key.amountMinor ?? 0,
    )
    .run();
}
