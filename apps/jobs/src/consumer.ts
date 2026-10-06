/** The queue's consumers: the job queue, and its dead letters.
 *
 * A delivery holds its job while it works (a lease in the job row), so two deliveries of one job
 * never write it at once; another delivery waits a minute and looks again. The lease is let go
 * before the next pass is queued, and the retry of a delivery that died takes its job over at
 * once: the lease names the message that holds it. */

import { getJob, now, updateJob } from './db';
import type { Env, QueueMessage } from './env';
import { errorCode } from './errors';
import { sendAlert } from './mail';
import { advance } from './pipeline';
import { MAX_DELIVERIES, settleFailedJob } from './pro/lifecycle';

/** A queue invocation gets thirty seconds of CPU but far more wall time; sections take ~30 s each,
 * so we stop writing after four minutes and let the message come back for the rest. */
const PASS_BUDGET_MS = 4 * 60 * 1000;
/** The longest a delivery may hold a job: as long as a queue invocation may run at all. */
const LEASE_MS = 15 * 60 * 1000;
/** How long a delivery that finds its job held waits before it looks again. */
const HELD_RETRY_SECONDS = 60;
/** How often, and how far apart, a dead letter for a job still on the move is looked at again. */
const DEAD_LETTER_CHECKS = 8;
const DEAD_LETTER_RETRY_SECONDS = 300;

export const DEAD_LETTER_QUEUE = 'natalka-jobs-dlq';

/** Takes the job for `holder`: when nobody holds it, the lease has run out, or `holder` is the
 * message that held it before (a retry of a delivery that died). One statement, so two
 * deliveries cannot both take it. */
export async function takeLease(db: D1Database, jobId: string, holder: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE jobs SET lease_until = ?, lease_by = ?
       WHERE id = ? AND (lease_until IS NULL OR lease_until < ? OR lease_by = ?)`,
    )
    .bind(new Date(Date.now() + LEASE_MS).toISOString(), holder, jobId, now(), holder)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function releaseLease(db: D1Database, jobId: string, holder: string): Promise<void> {
  try {
    await db.prepare('UPDATE jobs SET lease_until = NULL, lease_by = NULL WHERE id = ? AND lease_by = ?').bind(jobId, holder).run();
  } catch (error) {
    // The lease runs out on its own, and a retry of this message takes it over at once.
    console.error('releasing a job', jobId, errorCode(error));
  }
}

/** One delivery of a job message: one pass over the job, under its lease. */
export async function consumeJob(env: Env, message: Message<QueueMessage>, budgetMs = PASS_BUDGET_MS): Promise<void> {
  const { jobId } = message.body as { jobId: string };
  const before = await getJob(env.DB, jobId);
  if (!before || before.status === 'done') return message.ack();
  if (!(await takeLease(env.DB, jobId, message.id))) {
    // Another delivery is writing this job right now.
    return message.retry({ delaySeconds: HELD_RETRY_SECONDS });
  }

  let finished: boolean;
  try {
    // Read again under the lease: the delivery that held it may have finished the job meanwhile.
    const job = await getJob(env.DB, jobId);
    if (!job || job.status === 'done') {
      finished = true;
    } else {
      await updateJob(env.DB, job.id, { status: 'running', attempts: job.attempts + 1, last_error: null });
      finished = await advance(env, job, Date.now() + budgetMs);
    }
  } catch (error) {
    await releaseLease(env.DB, jobId, message.id);
    return failedPass(env, message, jobId, error);
  }
  // Let go first, so that the next pass finds the job free.
  await releaseLease(env.DB, jobId, message.id);
  // More sections to write: a fresh message rather than a long-running invocation.
  if (!finished) await env.JOBS.send({ jobId });
  message.ack();
}

async function failedPass(env: Env, message: Message<QueueMessage>, jobId: string, error: unknown): Promise<void> {
  const reason = errorCode(error);
  await updateJob(env.DB, jobId, { status: 'failed', last_error: reason });
  console.error('job failed', jobId, reason);
  // Retry with the queue's backoff; the work already banked in the payload is not repeated.
  if (message.attempts >= MAX_DELIVERIES) {
    try {
      if (await settleFailedJob(env, jobId)) {
        // A seller's reading is settled here rather than left in the dead-letter queue.
        return message.ack();
      }
    } catch (settleError) {
      console.error('settling a failed reading', jobId, errorCode(settleError));
    }
  }
  message.retry();
}

/** A message the queue gave up on. A job another delivery is still working on is left to it.
 * Otherwise the job has failed for good: a seller's reading is settled by the usual rule (what was
 * written is delivered, a reading with nothing written gives its credits back), and the owner is
 * told about a shopper's, whose status page now shows the failure. */
export async function deadLetter(env: Env, message: Message<QueueMessage>): Promise<void> {
  const body = message.body;
  if ('subscriptionId' in body) {
    // Its send date has not moved, so the hourly run queues it again.
    console.error('horoscope gave up', body.subscriptionId);
    return message.ack();
  }
  const job = await getJob(env.DB, body.jobId);
  if (!job || job.status === 'done') return message.ack();
  const held = job.lease_until !== null && job.lease_until > now();
  const moving = job.status !== 'failed' && Date.parse(job.updated_at) > Date.now() - LEASE_MS;
  if (held || moving) {
    // A duplicate gave up while another delivery carries the job on: look again later.
    return message.attempts < DEAD_LETTER_CHECKS ? message.retry({ delaySeconds: DEAD_LETTER_RETRY_SECONDS }) : message.ack();
  }
  await updateJob(env.DB, job.id, { status: 'failed', last_error: job.last_error ?? 'gave up' });
  if (await settleFailedJob(env, job.id)) return message.ack();
  await sendAlert(
    env,
    'A document could not be made',
    `job ${job.id}\norder ${job.order_id}\nstep ${job.step}\nlast error ${job.last_error ?? '-'}\n` +
      'The buyer sees that it failed: refund the order or run the job again.',
  );
  message.ack();
}
