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
      `INSERT INTO orders (id, email, product, locale, country, amount_minor, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      order.created_at,
    )
    .run();
}

export async function insertChart(
  db: D1Database,
  chart: {
    id: string;
    order_id: string;
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
       VALUES (?, ?, 1, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      chart.id,
      chart.order_id,
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
