/** What happens to a seller's reading after it is ordered: settling a failure, rewriting a
 * section, assembling and fetching the PDF. */

import { getJob, now, updateJob } from '../db';
import type { Env } from '../env';
import type { JobPayload } from '../pipeline';
import { refund } from './credits';

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
  const payload: JobPayload = job.payload ? (JSON.parse(job.payload) as JobPayload) : {};
  if ((payload.sections ?? []).length === 0) {
    await refund(env.DB, jobId);
    await env.DB.prepare('UPDATE pro_readings SET refunded_at = COALESCE(refunded_at, ?) WHERE order_id = ?')
      .bind(now(), reading.order_id)
      .run();
    await updateJob(env.DB, jobId, { status: 'failed' });
    return true;
  }
  await updateJob(env.DB, jobId, { step: 'done', status: 'done' });
  return true;
}
