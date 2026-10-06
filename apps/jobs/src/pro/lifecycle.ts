/** What happens to a seller's reading after it is ordered: settling a failure, rewriting a
 * section, assembling and fetching the PDF. */

import { documentForOrder, getJob, now, updateJob } from '../db';
import type { Env } from '../env';
import { errorCode } from '../errors';
import { documentFilename } from '../filename';
import {
  dropDocuments,
  loadBirth,
  loadPeople,
  openPayload,
  sealPayload,
  type WrittenSection,
  writeSection,
} from '../pipeline';
import { giveAttemptBack, takeAttempt } from './attempts';
import { refundStatement } from './credits';
import { readingRow, readingStatus, REGENERATIONS_PER_READING } from './readings';

/** Deliveries a job message gets before the queue gives up: the first plus max_retries (3, in
 * wrangler.jsonc). Keep the two in step. */
export const MAX_DELIVERIES = 4;

/** Called when the queue has delivered a seller's job for the last time and it still failed.
 * A reading never goes to the dead-letter queue: what was written is delivered, the gaps are
 * filled free on request, and a reading with nothing written gives its credits back. Returns
 * false for a shopper's job, which the queue handles as before. Safe to run twice. */
export async function settleFailedJob(env: Env, jobId: string): Promise<boolean> {
  const reading = await env.DB.prepare('SELECT order_id FROM pro_readings WHERE job_id = ?')
    .bind(jobId)
    .first<{ order_id: string }>();
  if (!reading) return false;
  const job = await getJob(env.DB, jobId);
  if (!job) return false;

  if (job.step === 'pdf') {
    // The texts are fine; only the assembly failed. The seller can ask again.
    await updateJob(env.DB, jobId, { step: 'done', status: 'done' });
    return true;
  }
  const payload = await openPayload(env, job);
  if ((payload.sections ?? []).length === 0) {
    // One batch: a refund without the mark would be repeatable, a mark without the refund a loss.
    const ts = now();
    await env.DB.batch([
      refundStatement(env.DB, jobId),
      env.DB.prepare('UPDATE pro_readings SET refunded_at = COALESCE(refunded_at, ?) WHERE order_id = ?').bind(
        ts,
        reading.order_id,
      ),
      env.DB.prepare("UPDATE jobs SET status = 'failed', updated_at = ? WHERE id = ?").bind(ts, jobId),
    ]);
    return true;
  }
  await updateJob(env.DB, jobId, { step: 'done', status: 'done' });
  return true;
}

export type RegenerateResult =
  | { status: 'ok'; section: { id: string; title: string; text: string }; regenerations_left: number }
  | { status: 'not_found' | 'not_ready' | 'frozen' | 'limit' | 'busy' | 'failed' };

const giveBack = (db: D1Database, orderId: string) =>
  db.prepare('UPDATE pro_readings SET regenerations = regenerations - 1 WHERE order_id = ? AND regenerations > 0')
    .bind(orderId)
    .run();

/** The longest a rewrite holds its reading. A section takes about half a minute to write; a hold
 * whose worker stopped before letting go runs out after this. */
export const REWRITE_HOLD_MS = 5 * 60 * 1000;

/** Takes the reading for one rewrite: the seller's own reading, when nobody holds it or the last
 * hold has run out. One statement, so two requests cannot both take it. Returns the hold's end,
 * which is also what lets it go, or null. */
async function holdReading(db: D1Database, orderId: string, accountId: string): Promise<string | null> {
  const until = new Date(Date.now() + REWRITE_HOLD_MS).toISOString();
  const taken = await db
    .prepare(
      `UPDATE pro_readings SET busy_until = ?
       WHERE order_id = ? AND account_id = ? AND (busy_until IS NULL OR busy_until < ?)`,
    )
    .bind(until, orderId, accountId, now())
    .run();
  return taken.meta.changes ? until : null;
}

/** Lets the reading go, unless the hold ran out and somebody else has taken it since. */
async function releaseReading(db: D1Database, orderId: string, until: string): Promise<void> {
  try {
    await db.prepare('UPDATE pro_readings SET busy_until = NULL WHERE order_id = ? AND busy_until = ?').bind(orderId, until).run();
  } catch (error) {
    // The hold runs out on its own.
    console.error('releasing a reading', orderId, errorCode(error));
  }
}

/** Rewrites one section of a finished reading. A section that was never written is filled free;
 * rewriting a written one uses one of the reading's paid rewrites, and only within the edit
 * window. The reading is held first, before anything is charged or sent to the model, and let go
 * however the rewrite ends: a request for the same reading meanwhile is told it is busy. The
 * rewrite is reserved before the model is called and given back if nothing is saved. */
export async function regenerateSection(
  env: Env,
  accountId: string,
  orderId: string,
  sectionId: string,
): Promise<RegenerateResult> {
  const hold = await holdReading(env.DB, orderId, accountId);
  if (!hold) return (await readingRow(env.DB, orderId, accountId)) ? { status: 'busy' } : { status: 'not_found' };
  try {
    return await rewriteHeld(env, accountId, orderId, sectionId);
  } finally {
    await releaseReading(env.DB, orderId, hold);
  }
}

/** The rewrite itself, read and written while the reading is held. */
async function rewriteHeld(env: Env, accountId: string, orderId: string, sectionId: string): Promise<RegenerateResult> {
  const row = await readingRow(env.DB, orderId, accountId);
  if (!row) return { status: 'not_found' };
  if (row.refunded_at || row.step !== 'done') return { status: 'not_ready' };
  const payload = await openPayload(env, row);
  const plan = payload.plan ?? [];
  if (!plan.some((p) => p.id === sectionId)) return { status: 'not_found' };
  const sections = payload.sections ?? [];
  const paid = sections.some((s) => s.id === sectionId);

  if (paid) {
    const ts = now();
    const reserved = await env.DB.prepare(
      `UPDATE pro_readings SET regenerations = regenerations + 1
       WHERE order_id = ? AND regenerations < ? AND editable_until > ?`,
    )
      .bind(orderId, REGENERATIONS_PER_READING, ts)
      .run();
    if (!reserved.meta.changes) return { status: row.editable_until <= ts ? 'frozen' : 'limit' };
  }

  let saved = false;
  let written: WrittenSection;
  try {
    try {
      const people = await loadPeople(env, { order_id: orderId, kind: row.product });
      const others = sections.filter((s) => s.id !== sectionId);
      written = await writeSection(env, row.product, people, payload, sectionId, others, row.address);
    } catch (error) {
      console.error('regenerating a section', orderId, sectionId, errorCode(error));
      return { status: 'failed' };
    }

    // Back in plan order, the new text in place of the old.
    const order = new Map(plan.map((p, index) => [p.id, index]));
    const next = [...sections.filter((s) => s.id !== sectionId), written].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    const sealed = await sealPayload(env, { ...payload, sections: next });
    const result = await env.DB.prepare(
      `UPDATE jobs SET payload = NULL, payload_ct = ?, payload_nonce = ?, sections_planned = ?, sections_written = ?,
                       tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, cost_micros = cost_micros + ?,
                       model = ?, updated_at = ?
       WHERE id = ? AND updated_at = ?`,
    )
      .bind(
        sealed.payload_ct,
        sealed.payload_nonce,
        sealed.sections_planned,
        sealed.sections_written,
        written.tokens_in,
        written.tokens_out,
        written.cost_micros,
        written.model,
        now(),
        row.job_id,
        row.updated_at,
      )
      .run();
    // The job changed meanwhile (a PDF was asked for, or a rewrite took over a hold that ran out):
    // saving now would undo that.
    if (!result.meta.changes) return { status: 'busy' };
    saved = true;
  } finally {
    // Whatever stopped the save, a rewrite that kept nothing is not charged.
    if (paid && !saved) await giveBack(env.DB, orderId);
  }
  try {
    await dropDocuments(env, orderId);
  } catch (error) {
    // The text is saved and the rewrite spent; a stale PDF is rebuilt on the next request.
    console.error('dropping stale documents', orderId, errorCode(error));
  }

  const used = await env.DB.prepare('SELECT regenerations FROM pro_readings WHERE order_id = ?')
    .bind(orderId)
    .first<{ regenerations: number }>();
  return {
    status: 'ok',
    section: { id: written.id, title: written.title, text: written.text },
    regenerations_left: Math.max(0, REGENERATIONS_PER_READING - (used?.regenerations ?? 0)),
  };
}

export type AssembleResult =
  | 'queued'
  | 'not_found'
  | 'not_ready'
  | 'incomplete'
  | 'building'
  | 'no_brand'
  | 'too_many';

/** PDFs one reading may be assembled into per hour. */
export const ASSEMBLIES_PER_HOUR = 10;

/** Puts a finished reading back on the queue to have its PDF made. Every planned section must be
 * there: a PDF with a hole in it is not something to hand a client. An assembly that is queued
 * counts towards the reading's hour; one refused or never queued does not. */
export async function assemblePdf(env: Env, accountId: string, orderId: string): Promise<AssembleResult> {
  const row = await readingRow(env.DB, orderId, accountId);
  if (!row) return 'not_found';
  if (row.step === 'pdf') return 'building';
  if (readingStatus(row) !== 'ready') return 'not_ready';
  const payload = await openPayload(env, row);
  const written = new Set((payload.sections ?? []).map((s) => s.id));
  if ((payload.plan ?? []).some((p) => !written.has(p.id))) return 'incomplete';

  const brand = await env.DB.prepare('SELECT 1 AS one FROM pro_brands WHERE account_id = ?')
    .bind(accountId)
    .first();
  if (!brand) return 'no_brand';

  const attempt = await takeAttempt(env.DB, 'pdf', orderId, ASSEMBLIES_PER_HOUR);
  if (!attempt) return 'too_many';
  const moved = await env.DB.prepare(
    "UPDATE jobs SET step = 'pdf', status = 'queued', updated_at = ? WHERE id = ? AND step = 'done'",
  )
    .bind(now(), row.job_id)
    .run();
  if (!moved.meta.changes) {
    await giveAttemptBack(env.DB, attempt);
    return 'building';
  }
  try {
    await env.JOBS.send({ jobId: row.job_id });
  } catch (error) {
    console.error('PDF assembly could not be queued', row.job_id, errorCode(error));
    try {
      await env.DB.prepare(
        "UPDATE jobs SET step = 'done', status = 'done', updated_at = ? WHERE id = ? AND step = 'pdf'",
      )
        .bind(now(), row.job_id)
        .run();
      await giveAttemptBack(env.DB, attempt);
    } catch (cleanupError) {
      console.error('undoing the PDF request failed', row.job_id, errorCode(cleanupError));
    }
    throw error;
  }
  return 'queued';
}

/** The reading's PDF and the name it should be saved under, if it has been assembled. */
export async function readingPdf(
  env: Env,
  accountId: string,
  orderId: string,
): Promise<{ body: ReadableStream; filename: string } | null> {
  const row = await readingRow(env.DB, orderId, accountId);
  if (!row || row.step !== 'done') return null;
  const document = await documentForOrder(env.DB, orderId);
  if (!document) return null;
  const object = await env.DOCS.get(document.storage_key);
  if (!object) return null;
  const first = await loadBirth(env, orderId);
  const second = row.product === 'synastry' ? await loadBirth(env, orderId, 2) : null;
  return { body: object.body, filename: documentFilename(row.product, first.lang, first, second) };
}
