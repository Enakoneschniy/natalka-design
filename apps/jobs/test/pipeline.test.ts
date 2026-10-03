import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { dropDocuments } from '../src/pipeline';
import { armFailure, runJob, testEnv } from './env';
import { seedOrder } from './seed';

const count = async (sql: string, ...args: unknown[]) =>
  ((await testEnv.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0);

describe('pipeline', () => {
  it('takes a shopper all the way to the letter, as before', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Покупатель' });
    expect(await runJob(jobId)).toBe(true);
    const job = await getJob(testEnv.DB, jobId);
    expect(job?.step).toBe('done');
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM email_events WHERE order_id = ?', orderId)).toBe(1);
  });

  it("stops a seller's reading after the texts: no PDF, no letter", async () => {
    const { orderId, jobId } = await seedOrder({ pro: true, name: 'Клиентка' });
    expect(await runJob(jobId)).toBe(true);
    const job = await getJob(testEnv.DB, jobId);
    expect(job).toMatchObject({ step: 'done', status: 'done' });
    expect(JSON.parse(job?.payload ?? '{}').sections.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c']);
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM email_events WHERE order_id = ?', orderId)).toBe(0);
  });

  it("assembles a seller's PDF on request, replacing the previous one, without a letter", async () => {
    const { orderId, jobId } = await seedOrder({ pro: true, name: 'Сборка' });
    await runJob(jobId);
    for (let round = 0; round < 2; round++) {
      await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
      expect(await runJob(jobId)).toBe(true);
    }
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('done');
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM email_events WHERE order_id = ?', orderId)).toBe(0);
    const doc = await testEnv.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ?')
      .bind(orderId)
      .first<{ storage_key: string }>();
    expect(await testEnv.DOCS.get(doc?.storage_key ?? '')).not.toBeNull();
  });

  it('keeps what was written when a section fails, for the retry to resume', async () => {
    const { jobId } = await seedOrder({ pro: true, name: 'Сбой' });
    await armFailure('Сбой|b', 1);
    await expect(runJob(jobId)).rejects.toThrow(/503/);
    const written = JSON.parse((await getJob(testEnv.DB, jobId))?.payload ?? '{}').sections;
    expect(written.map((s: { id: string }) => s.id)).toEqual(['a']);
    expect(await runJob(jobId)).toBe(true);
  });

  it('drops every document of an order, objects first', async () => {
    const { orderId, jobId } = await seedOrder({ pro: true, name: 'Удаление' });
    await runJob(jobId);
    await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
    await runJob(jobId);
    const key = (
      await testEnv.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ?')
        .bind(orderId)
        .first<{ storage_key: string }>()
    )?.storage_key as string;
    await dropDocuments(testEnv, orderId);
    expect(await testEnv.DOCS.get(key)).toBeNull();
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(0);
  });
});
