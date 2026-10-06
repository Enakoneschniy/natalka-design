import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeJob, DEAD_LETTER_QUEUE, deadLetter, takeLease } from '../src/consumer';
import { getJob } from '../src/db';
import type { Env, QueueMessage } from '../src/env';
import worker from '../src/index';
import { balance } from '../src/pro/credits';
import { readingRow } from '../src/pro/readings';
import { letters, recordingQueue, testEnv } from './env';
import { readingFor, seedOrder } from './seed';

afterEach(() => vi.restoreAllMocks());

/** One delivery of `body` from `queue` to the worker, and what became of the message. */
async function deliver(body: QueueMessage, opts: { queue?: string; id?: string; attempts?: number; env?: Env } = {}) {
  const batch = createMessageBatch<QueueMessage>(opts.queue ?? 'natalka-jobs', [
    { id: opts.id ?? crypto.randomUUID(), timestamp: new Date(), attempts: opts.attempts ?? 1, body },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, opts.env ?? testEnv);
  return getQueueResult(batch, ctx);
}

/** A message that records what the consumer did with it, retry options included (the test
 * batch does not keep those). */
function recordedMessage(body: QueueMessage) {
  const seen: { acked: boolean; retried: { delaySeconds?: number } | null } = { acked: false, retried: null };
  const message = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: () => {
      seen.acked = true;
    },
    retry: (options?: { delaySeconds?: number }) => {
      seen.retried = options ?? {};
    },
  } as unknown as Message<QueueMessage>;
  return { message, seen };
}

const lease = (jobId: string) =>
  testEnv.DB.prepare('SELECT lease_until, lease_by FROM jobs WHERE id = ?').bind(jobId).first<{
    lease_until: string | null;
    lease_by: string | null;
  }>();

describe('a job delivery', () => {
  it('runs the job under a lease and lets it go when done', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Аренда' });
    const result = await deliver({ jobId });
    expect(result.explicitAcks).toHaveLength(1);
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('done');
    expect(await lease(jobId)).toEqual({ lease_until: null, lease_by: null });
  });

  it('waits a minute when another delivery holds the job, and leaves the job alone', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Занято' });
    expect(await takeLease(testEnv.DB, jobId, 'another-message')).toBe(true);
    const { message, seen } = recordedMessage({ jobId });
    await consumeJob(testEnv, message);
    expect(seen).toEqual({ acked: false, retried: { delaySeconds: 60 } });
    expect(await getJob(testEnv.DB, jobId)).toMatchObject({ step: 'calc', status: 'queued', attempts: 0 });
  });

  it('is taken over at once by the retry of the delivery that held it', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Перехват' });
    expect(await takeLease(testEnv.DB, jobId, 'message-1')).toBe(true);
    const result = await deliver({ jobId }, { id: 'message-1', attempts: 2 });
    expect(result.explicitAcks).toEqual(['message-1']);
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('done');
  });

  it('takes a job whose lease has run out', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Истекла' });
    await testEnv.DB.prepare("UPDATE jobs SET lease_until = ?, lease_by = 'dead' WHERE id = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), jobId)
      .run();
    expect((await deliver({ jobId })).explicitAcks).toHaveLength(1);
  });

  it('lets the job go before it queues the next pass', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Продолжение' });
    const { env, sent } = recordingQueue();
    const batch = createMessageBatch<QueueMessage>('natalka-jobs', [
      { id: 'pass-1', timestamp: new Date(), attempts: 1, body: { jobId } },
    ]);
    const ctx = createExecutionContext();
    // No time left after the calculation: the pass stops and hands over.
    const message = batch.messages[0] as Message<QueueMessage>;
    await consumeJob(env, message, 0);
    expect(sent).toEqual([{ jobId }]);
    expect(await lease(jobId)).toEqual({ lease_until: null, lease_by: null });
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['pass-1']);
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('texts');
  });

  it('lets the job go when the pass fails, for the retry to take it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { jobId } = await seedOrder({ pro: false, name: 'Сбой', date: '1900-01-01' });
    const result = await deliver({ jobId });
    expect(result.retryMessages).toHaveLength(1);
    expect(await lease(jobId)).toEqual({ lease_until: null, lease_by: null });
    expect((await getJob(testEnv.DB, jobId))?.status).toBe('failed');
  });
});

describe('a dead letter', () => {
  it("fails a shopper's job and tells the owner, by ids alone", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Мёртвое письмо' });
    await testEnv.DB.prepare("UPDATE jobs SET status = 'failed', last_error = 'ephemeris /v1/calc → 500', updated_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 3600_000).toISOString(), jobId)
      .run();
    const result = await deliver({ jobId }, { queue: DEAD_LETTER_QUEUE });
    expect(result.explicitAcks).toHaveLength(1);
    expect((await getJob(testEnv.DB, jobId))?.status).toBe('failed');
    const [alert] = (await letters('owner@alerts.test')).filter((l) => l.text.includes(jobId));
    expect(alert?.subject).toBe('[Chronika] A document could not be made');
    expect(alert?.text).toContain(`order ${orderId}`);
    expect(alert?.text).toContain('code gave_up_at_calc');
    expect(alert?.text).not.toContain('Мёртвое письмо');
  });

  it('keeps what the job last recorded out of the alert and the log', async () => {
    const logged: string[] = [];
    for (const method of ['warn', 'error', 'log'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')));
    }
    const { jobId } = await seedOrder({ pro: false, name: 'Без подробностей' });
    await testEnv.DB.prepare("UPDATE jobs SET status = 'failed', last_error = 'no chart 1 for order x-recorded', updated_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 3600_000).toISOString(), jobId)
      .run();
    await deliver({ jobId }, { queue: DEAD_LETTER_QUEUE });
    const [alert] = (await letters('owner@alerts.test')).filter((l) => l.text.includes(jobId));
    expect(alert?.text).not.toContain('x-recorded');
    expect(alert?.html).not.toContain('x-recorded');
    expect(logged.join('\n')).not.toContain('x-recorded');
  });

  it("settles a seller's reading by the usual rule: nothing written gives the credits back", async () => {
    const { account, id, jobId } = await readingFor('Возврат кредита');
    expect(await balance(testEnv.DB, account.id)).toBe(2);
    await testEnv.DB.prepare("UPDATE jobs SET status = 'failed', updated_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 3600_000).toISOString(), jobId)
      .run();
    expect((await deliver({ jobId }, { queue: DEAD_LETTER_QUEUE })).explicitAcks).toHaveLength(1);
    expect(await balance(testEnv.DB, account.id)).toBe(3);
    expect((await readingRow(testEnv.DB, id, account.id))?.refunded_at).toBeTruthy();
  });

  it('leaves a job another delivery is still working on, and looks again later', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Ещё идёт' });
    await takeLease(testEnv.DB, jobId, 'live-delivery');
    const { message, seen } = recordedMessage({ jobId });
    await deadLetter(testEnv, message);
    expect(seen).toEqual({ acked: false, retried: { delaySeconds: 300 } });
    expect((await getJob(testEnv.DB, jobId))?.status).toBe('queued');
  });

  it('leaves a job that moved a moment ago, and one that is done', async () => {
    const moving = await seedOrder({ pro: false, name: 'Движется' });
    await testEnv.DB.prepare("UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), moving.jobId)
      .run();
    expect((await deliver({ jobId: moving.jobId }, { queue: DEAD_LETTER_QUEUE })).retryMessages).toHaveLength(1);
    expect((await getJob(testEnv.DB, moving.jobId))?.status).toBe('running');

    const done = await seedOrder({ pro: false, name: 'Готово' });
    await testEnv.DB.prepare("UPDATE jobs SET status = 'done', step = 'done' WHERE id = ?").bind(done.jobId).run();
    expect((await deliver({ jobId: done.jobId }, { queue: DEAD_LETTER_QUEUE })).explicitAcks).toHaveLength(1);
  });

  it('fails a job that stopped moving long ago, even if it never got to say so', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { jobId } = await seedOrder({ pro: false, name: 'Застрял' });
    await testEnv.DB.prepare("UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 3600_000).toISOString(), jobId)
      .run();
    expect((await deliver({ jobId }, { queue: DEAD_LETTER_QUEUE })).explicitAcks).toHaveLength(1);
    expect((await getJob(testEnv.DB, jobId))?.status).toBe('failed');
  });

  it('lets a horoscope go: the hourly run queues it again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await deliver({ subscriptionId: crypto.randomUUID() }, { queue: DEAD_LETTER_QUEUE });
    expect(result.explicitAcks).toHaveLength(1);
  });
});
