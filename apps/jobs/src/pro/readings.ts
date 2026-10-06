/** A seller's readings: ordering one with credits, reading it back, and forgetting a client.
 *
 * A reading is an order like a shopper's (the pipeline writes it the same way) with a
 * pro_readings row beside it. The credits are spent before anything is written and before any
 * row exists; if the rows cannot be written, the credits go straight back.
 */

import { type Blobish, encryptJson } from '../crypto';
import { documentForOrder, expiryFrom, type JobStatus, type JobStep, now, type Product } from '../db';
import type { Env } from '../env';
import { errorCode } from '../errors';
import { type JobPayload, openPayload, sectionCounts } from '../pipeline';
import { type ClientBirth, getClient } from './clients';
import { balance, CREDIT_COST, refund, refundStatement, spend } from './credits';
import { dropFilesThenRows, readingFolder } from './storage';

/** Seller readings are written in Russian during the pilot. */
export const PRO_LANG = 'ru';
export const REGENERATIONS_PER_READING = 10;
export const EDITABLE_DAYS = 14;
/** A seller's charts stay with their client; the nightly sweep never reaches this date. */
export const KEEP_FOREVER = '9999-12-31T23:59:59.999Z';

export type CreateReadingResult =
  | { status: 'created'; id: string }
  | { status: 'insufficient'; balance: number }
  | { status: 'invalid'; error: string };

const isProduct = (value: unknown): value is Product =>
  typeof value === 'string' && Object.hasOwn(CREDIT_COST, value);

export async function createReading(
  env: Env,
  account: { id: string; email: string; tone?: 'ty' | 'vy' },
  input: { product?: unknown; client_id?: unknown; partner_client_id?: unknown },
): Promise<CreateReadingResult> {
  if (!isProduct(input.product)) return { status: 'invalid', error: 'product' };
  const product = input.product;
  const client =
    typeof input.client_id === 'string' ? await getClient(env, account.id, input.client_id) : null;
  if (!client) return { status: 'invalid', error: 'client' };

  const wantsPartner = input.partner_client_id !== undefined && input.partner_client_id !== null;
  let partner: (ClientBirth & { id: string }) | null = null;
  if (product === 'synastry') {
    if (typeof input.partner_client_id !== 'string' || input.partner_client_id === client.id) {
      return { status: 'invalid', error: 'partner' };
    }
    partner = await getClient(env, account.id, input.partner_client_id);
    if (!partner) return { status: 'invalid', error: 'partner' };
  } else if (wantsPartner) {
    return { status: 'invalid', error: 'partner' };
  }

  const orderId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const cost = CREDIT_COST[product];
  if (!(await spend(env.DB, { accountId: account.id, amount: cost, ref: jobId }))) {
    return { status: 'insufficient', balance: await balance(env.DB, account.id) };
  }

  const ts = now();
  try {
    const people = partner ? [client, partner] : [client];
    const charts = await Promise.all(
      people.map(async (person, index) => {
        const birth: ClientBirth = {
          name: person.name,
          date: person.date,
          time: person.time,
          latitude: person.latitude,
          longitude: person.longitude,
          zone: person.zone,
          place: person.place,
          gender: person.gender,
        };
        const { ciphertext, nonce } = await encryptJson({ ...birth, lang: PRO_LANG }, env.DATA_KEY);
        // The name and the place live in the ciphertext only.
        return env.DB.prepare(
          `INSERT INTO charts (id, order_id, person_no, birth_ciphertext, birth_nonce, key_version,
                               unknown_time, gender, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          orderId,
          index + 1,
          ciphertext,
          nonce,
          birth.time === null ? 1 : 0,
          birth.gender,
          KEEP_FOREVER,
          ts,
        );
      }),
    );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status,
                             pro_account_id, created_at, paid_at)
         VALUES (?, ?, ?, ?, ?, 'credit', 'paid', ?, ?, ?)`,
      ).bind(orderId, account.email, product, PRO_LANG, cost, account.id, ts, ts),
      ...charts,
      env.DB.prepare(
        `INSERT INTO jobs (id, order_id, kind, step, status, created_at, updated_at)
         VALUES (?, ?, ?, 'calc', 'queued', ?, ?)`,
      ).bind(jobId, orderId, product, ts, ts),
      env.DB.prepare(
        `INSERT INTO pro_readings (order_id, account_id, job_id, client_id, partner_client_id,
                                   editable_until, address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        orderId,
        account.id,
        jobId,
        client.id,
        partner?.id ?? null,
        expiryFrom(EDITABLE_DAYS),
        account.tone ?? 'vy',
        ts,
      ),
    ]);
  } catch (error) {
    try {
      await refund(env.DB, jobId);
    } catch (refundError) {
      console.error('refund failed', jobId, errorCode(refundError));
    }
    throw error;
  }
  try {
    await env.JOBS.send({ jobId });
  } catch (error) {
    console.error('reading could not be queued', jobId, errorCode(error));
    try {
      const ts = now();
      await env.DB.batch([
        refundStatement(env.DB, jobId),
        env.DB.prepare('UPDATE pro_readings SET refunded_at = ? WHERE order_id = ?').bind(ts, orderId),
        env.DB.prepare("UPDATE jobs SET status = 'failed', updated_at = ? WHERE id = ?").bind(ts, jobId),
      ]);
    } catch (cleanupError) {
      console.error('refund after queue failure failed', jobId, errorCode(cleanupError));
    }
    throw error;
  }
  return { status: 'created', id: orderId };
}

export interface ReadingRow {
  order_id: string;
  account_id: string;
  job_id: string;
  client_id: string;
  partner_client_id: string | null;
  regenerations: number;
  editable_until: string;
  refunded_at: string | null;
  address: 'vy' | 'ty';
  created_at: string;
  product: Product;
  step: JobStep;
  status: JobStatus;
  /** The plan's sections and how many are written (see sealPayload); NULL in a row from before
   * the counts were kept. */
  sections_planned: number | null;
  sections_written: number | null;
  /** The job's payload as stored; read it with openPayload. */
  payload: string | null;
  payload_ct: Blobish | null;
  payload_nonce: Blobish | null;
  updated_at: string;
}

/** Everything about a reading but its payload. */
const SUMMARY_COLUMNS = `r.order_id, r.account_id, r.job_id, r.client_id, r.partner_client_id,
       r.regenerations, r.editable_until, r.refunded_at, r.address, r.created_at,
       o.product, j.step, j.status, j.sections_planned, j.sections_written, j.updated_at`;
const READING_COLUMNS = `${SUMMARY_COLUMNS}, j.payload, j.payload_ct, j.payload_nonce`;
const READING_FROM = 'FROM pro_readings r JOIN orders o ON o.id = r.order_id JOIN jobs j ON j.id = r.job_id';
const READING_SELECT = `SELECT ${READING_COLUMNS}\n  ${READING_FROM}`;
/** The list never reads a payload: what is missing comes from the counts beside it, and whether a
 * PDF exists from the same query rather than one per reading. */
const LIST_SELECT = `SELECT ${SUMMARY_COLUMNS},
       EXISTS (SELECT 1 FROM documents d WHERE d.order_id = r.order_id) AS has_document
  ${READING_FROM}`;

type SummaryRow = Omit<ReadingRow, 'payload' | 'payload_ct' | 'payload_nonce'> & { has_document: number };

/** A reading, only if it is this seller's. */
export function readingRow(db: D1Database, orderId: string, accountId: string): Promise<ReadingRow | null> {
  return db.prepare(`${READING_SELECT} WHERE r.order_id = ? AND r.account_id = ?`).bind(orderId, accountId).first<ReadingRow>();
}

/** A reading with no owner check. Only for the order named by PRO_DEMO_ORDER_ID: callers must pass
 * that var, never user input. */
export function demoReadingRow(db: D1Database, orderId: string): Promise<ReadingRow | null> {
  return db.prepare(`${READING_SELECT} WHERE r.order_id = ?`).bind(orderId).first<ReadingRow>();
}

export type ReadingStatus = 'writing' | 'ready' | 'failed';

/** 'pdf' counts as ready: the texts are final and only the PDF is being assembled. */
export function readingStatus(row: Pick<ReadingRow, 'refunded_at' | 'step'>): ReadingStatus {
  if (row.refunded_at) return 'failed';
  return row.step === 'done' || row.step === 'pdf' ? 'ready' : 'writing';
}

export interface ReadingView {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  written: number;
  total: number;
  /** In the order of the plan. */
  sections: { id: string; title: string; text: string }[];
  /** Planned sections that could not be written; filled free of charge. Empty while writing. */
  missing: { id: string; title: string }[];
  regenerations_left: number;
  editable_until: string;
  frozen: boolean;
  pdf: 'none' | 'building' | 'ready';
  pages: number | null;
  created_at: string;
}

export async function readingView(env: Env, row: ReadingRow): Promise<ReadingView> {
  const payload = await openPayload(env, row);
  if (row.sections_planned === null || row.sections_written === null) await keepCounts(env, row.job_id, payload);
  const plan = payload.plan ?? [];
  const byId = new Map((payload.sections ?? []).map((s) => [s.id, s]));
  const status = readingStatus(row);
  const document = row.step === 'done' ? await documentForOrder(env.DB, row.order_id) : null;
  return {
    id: row.order_id,
    product: row.product,
    client_id: row.client_id,
    partner_client_id: row.partner_client_id,
    status,
    written: byId.size,
    total: plan.length,
    sections: plan.flatMap((p) => {
      const s = byId.get(p.id);
      return s ? [{ id: s.id, title: s.title, text: s.text }] : [];
    }),
    missing: status === 'ready' ? plan.filter((p) => !byId.has(p.id)).map((p) => ({ id: p.id, title: p.title })) : [],
    regenerations_left: Math.max(0, REGENERATIONS_PER_READING - row.regenerations),
    editable_until: row.editable_until,
    frozen: row.editable_until <= now(),
    pdf: row.step === 'pdf' ? 'building' : document ? 'ready' : 'none',
    pages: document?.pages ?? null,
    created_at: row.created_at,
  };
}

export interface ReadingSummary {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  /** Planned sections not written; only counted once the reading is ready, else 0. */
  missing: number;
  /** A PDF has been assembled and is not being rebuilt. */
  pdf_ready: boolean;
  created_at: string;
}

/** The counts of a row from before they were kept, from the payload just read for it; a list of
 * readings shows what is missing from them. Only while the row still has none: a payload written
 * since came with its own. */
async function keepCounts(env: Env, jobId: string, payload: JobPayload): Promise<void> {
  const counts = sectionCounts(payload);
  try {
    await env.DB.prepare(
      'UPDATE jobs SET sections_planned = ?, sections_written = ? WHERE id = ? AND sections_planned IS NULL',
    )
      .bind(counts.sections_planned, counts.sections_written, jobId)
      .run();
  } catch (error) {
    console.error('keeping the section counts', jobId, errorCode(error));
  }
}

/** Planned sections a ready reading lacks, from the counts kept beside its payload. 0 while it is
 * being written, and for a row from before the counts were kept until it is opened or its plain
 * payload is encrypted by the nightly sweep. */
function missingOf(row: Pick<ReadingRow, 'refunded_at' | 'step' | 'sections_planned' | 'sections_written'>): number {
  if (readingStatus(row) !== 'ready' || row.sections_planned === null || row.sections_written === null) return 0;
  return Math.max(0, row.sections_planned - row.sections_written);
}

export async function listReadings(env: Env, accountId: string, clientId?: string): Promise<ReadingSummary[]> {
  const where = clientId
    ? 'WHERE r.account_id = ? AND (r.client_id = ? OR r.partner_client_id = ?)'
    : 'WHERE r.account_id = ?';
  const binds = clientId ? [accountId, clientId, clientId] : [accountId];
  const { results } = await env.DB.prepare(
    `${LIST_SELECT} ${where} ORDER BY r.created_at DESC, r.rowid DESC`,
  )
    .bind(...binds)
    .all<SummaryRow>();
  return results.map((row) => ({
    id: row.order_id,
    product: row.product,
    client_id: row.client_id,
    partner_client_id: row.partner_client_id,
    status: readingStatus(row),
    missing: missingOf(row),
    pdf_ready: row.step === 'done' && row.has_document === 1,
    created_at: row.created_at,
  }));
}

/** Forgets a client: every reading they are in, as client or partner, goes with them — orders,
 * jobs, charts and PDFs. The ledger keeps its rows; they say what was spent, not on whom. */
export async function deleteClient(env: Env, accountId: string, clientId: string): Promise<boolean> {
  const owned = await env.DB.prepare('SELECT 1 AS yes FROM pro_clients WHERE id = ? AND account_id = ?')
    .bind(clientId, accountId)
    .first();
  if (!owned) return false;
  const { results } = await env.DB.prepare(
    'SELECT order_id FROM pro_readings WHERE account_id = ? AND (client_id = ? OR partner_client_id = ?)',
  )
    .bind(accountId, clientId, clientId)
    .all<{ order_id: string }>();
  const orders = results.map((row) => row.order_id);
  // An order takes its charts, job, documents, reading and reports with it.
  await dropFilesThenRows(env, orders.map(readingFolder), [
    ...orders.map((id) => env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id)),
    env.DB.prepare('DELETE FROM pro_clients WHERE id = ? AND account_id = ?').bind(clientId, accountId),
  ]);
  return true;
}
