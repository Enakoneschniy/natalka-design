import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJob } from '../src/db';
import type { QueueMessage } from '../src/env';
import { errorCode, UpstreamError } from '../src/errors';
import worker from '../src/index';
import { advance } from '../src/pipeline';
import { armFailure, testEnv } from './env';
import { seedOrder } from './seed';

const envWith = (name: string, value: unknown) => {
  const env = Object.create(testEnv);
  Object.defineProperty(env, name, { value });
  return env;
};

/** One delivery of a job message to the worker's queue handler. */
async function deliver(jobId: string, attempts = 1) {
  const batch = createMessageBatch<QueueMessage>('natalka-jobs', [
    { id: crypto.randomUUID(), timestamp: new Date(), attempts, body: { jobId } },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, testEnv);
  return getQueueResult(batch, ctx);
}

afterEach(() => vi.restoreAllMocks());

describe('calls to the text API', () => {
  it('are not made at all without the API key', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Без ключа' });
    const job = await getJob(testEnv.DB, jobId);
    await expect(advance(envWith('NATALKA_API_KEY', undefined), job!, Date.now() + 60_000)).rejects.toThrow(
      'NATALKA_API_KEY is not configured',
    );
  });

  it('leave the preview unavailable without the API key', async () => {
    const response = await worker.fetch(
      new Request('https://jobs.test/v1/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-site-key': 'test-site-key' },
        body: JSON.stringify({ facts: { birth: { date: '1990-01-01' } }, lang: 'ru' }),
      }),
      envWith('NATALKA_API_KEY', undefined),
      createExecutionContext(),
    );
    expect(response.status).toBe(503);
  });
});

describe('a failed job', () => {
  it('keeps only the call that failed and its status, never the answer', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    const { jobId } = await seedOrder({ pro: false, name: 'Тайна' });
    await armFailure('Тайна|*', 1);

    const result = await deliver(jobId);
    expect(result.retryMessages).toHaveLength(1);
    const job = await getJob(testEnv.DB, jobId);
    expect(job?.status).toBe('failed');
    expect(job?.last_error).toBe('/v1/section → 503');
    expect(errors.join('\n')).not.toContain('Тайна');
    expect(errors.join('\n')).not.toContain('model down');
  });

  it('names the missing record when the chart is gone', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Без карты' });
    await testEnv.DB.prepare('DELETE FROM charts WHERE order_id = (SELECT order_id FROM jobs WHERE id = ?)')
      .bind(jobId)
      .run();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await deliver(jobId);
    expect((await getJob(testEnv.DB, jobId))?.last_error).toMatch(/^no chart 1 for order /);
  });
});

describe('errorCode', () => {
  it('reports anything unexpected by its class alone', () => {
    expect(errorCode(new TypeError('Оксана, 1990-05-17'))).toBe('internal TypeError');
    expect(errorCode('a string')).toBe('internal');
    expect(errorCode(new UpstreamError('/v1/section', 503))).toBe('/v1/section → 503');
  });
});
