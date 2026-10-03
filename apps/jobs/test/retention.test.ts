import { describe, expect, it } from 'vitest';
import { scrubExpiredJobPayloads } from '../src/db';
import { testEnv } from './env';
import { seedOrder } from './seed';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const payloadOf = async (jobId: string) =>
  (
    await testEnv.DB.prepare('SELECT payload FROM jobs WHERE id = ?').bind(jobId).first<{ payload: string | null }>()
  )?.payload ?? null;

async function withPayload(opts: { pro: boolean; age: number; name: string }) {
  const seeded = await seedOrder({ pro: opts.pro, name: opts.name, createdAt: daysAgo(opts.age) });
  await testEnv.DB.prepare("UPDATE jobs SET payload = '{\"facts\":{\"birth\":{\"date\":\"1994-05-15\"}}}' WHERE id = ?")
    .bind(seeded.jobId)
    .run();
  return seeded;
}

describe('retention of job payloads', () => {
  it("clears a shopper's payload past the retention date and keeps everything else", async () => {
    const old = await withPayload({ pro: false, age: 31, name: 'Старый' });
    const recent = await withPayload({ pro: false, age: 29, name: 'Свежий' });
    const seller = await withPayload({ pro: true, age: 400, name: 'Продавец' });

    expect(await scrubExpiredJobPayloads(testEnv.DB, 30)).toBeGreaterThanOrEqual(1);

    expect(await payloadOf(old.jobId)).toBeNull();
    expect(await payloadOf(recent.jobId)).not.toBeNull();
    expect(await payloadOf(seller.jobId)).not.toBeNull();
  });

  it('keeps the order row and the cost of the job', async () => {
    const old = await withPayload({ pro: false, age: 45, name: 'Учёт' });
    await testEnv.DB.prepare('UPDATE jobs SET cost_micros = 4242 WHERE id = ?').bind(old.jobId).run();
    await scrubExpiredJobPayloads(testEnv.DB, 30);
    const row = await testEnv.DB.prepare(
      'SELECT o.id AS order_id, j.cost_micros FROM jobs j JOIN orders o ON o.id = j.order_id WHERE j.id = ?',
    )
      .bind(old.jobId)
      .first();
    expect(row).toEqual({ order_id: old.orderId, cost_micros: 4242 });
  });
});
