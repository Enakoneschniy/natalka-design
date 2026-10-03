import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { balance } from '../src/pro/credits';
import { settleFailedJob } from '../src/pro/lifecycle';
import { readingRow, readingView } from '../src/pro/readings';
import { armFailure, runJob, testEnv } from './env';
import { readingFor, seedOrder } from './seed';

describe('settleFailedJob', () => {
  it('gives the credits back, once, when nothing could be written', async () => {
    const { account, id, jobId } = await readingFor('Нет расчёта', { date: '1900-01-01' });
    expect(await balance(testEnv.DB, account.id)).toBe(2);
    await expect(runJob(jobId)).rejects.toThrow(/ephemeris/);

    expect(await settleFailedJob(testEnv, jobId)).toBe(true);
    expect(await settleFailedJob(testEnv, jobId)).toBe(true);

    expect(await balance(testEnv.DB, account.id)).toBe(3);
    const view = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(view.status).toBe('failed');
  });

  it('never runs a refunded reading again, even when a late delivery arrives', async () => {
    const { account, jobId } = await readingFor('Возврат', { date: '1900-01-01' });
    await expect(runJob(jobId)).rejects.toThrow(/ephemeris/);
    await settleFailedJob(testEnv, jobId);
    expect(await balance(testEnv.DB, account.id)).toBe(3);

    expect(await runJob(jobId)).toBe(true);
    expect(await balance(testEnv.DB, account.id)).toBe(3);
    const job = await getJob(testEnv.DB, jobId);
    expect(job?.status).toBe('failed');
    expect(JSON.parse(job?.payload ?? '{}').sections ?? []).toEqual([]);
  });

  it('does not write a free reading after the sections failed and were refunded', async () => {
    const { account, jobId } = await readingFor('Возврат два');
    await armFailure('Возврат два|*');
    await expect(runJob(jobId)).rejects.toThrow(/503/);
    await settleFailedJob(testEnv, jobId);
    expect(await balance(testEnv.DB, account.id)).toBe(3);

    await armFailure('Возврат два|*', 0);
    expect(await runJob(jobId)).toBe(true);
    expect(await balance(testEnv.DB, account.id)).toBe(3);
    const job = await getJob(testEnv.DB, jobId);
    expect(job?.status).toBe('failed');
    expect(JSON.parse(job?.payload ?? '{}').sections ?? []).toEqual([]);
  });

  it('books the refund, the reading and the job in one batch', async () => {
    const { account, id, jobId } = await readingFor('Пакет', { date: '1900-01-01' });
    await expect(runJob(jobId)).rejects.toThrow(/ephemeris/);
    let batches = 0;
    const db = new Proxy(testEnv.DB, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'batch') {
          return (...args: unknown[]) => {
            batches++;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    expect(await settleFailedJob({ ...testEnv, DB: db }, jobId)).toBe(true);
    expect(batches).toBe(1);
    expect(await balance(testEnv.DB, account.id)).toBe(3);
    expect((await readingRow(testEnv.DB, id, account.id))?.refunded_at).not.toBeNull();
    expect((await getJob(testEnv.DB, jobId))?.status).toBe('failed');
  });

  it('delivers what was written and lists the rest as missing', async () => {
    const { account, id, jobId } = await readingFor('Частично');
    await armFailure('Частично|b');
    await expect(runJob(jobId)).rejects.toThrow(/503/);

    expect(await settleFailedJob(testEnv, jobId)).toBe(true);
    expect(await balance(testEnv.DB, account.id)).toBe(2);
    const view = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(view).toMatchObject({ status: 'ready', written: 1 });
    expect(view.missing.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('puts a reading whose PDF would not build back to ready', async () => {
    const { jobId } = await readingFor('Без PDF');
    await runJob(jobId);
    await armFailure('Без PDF|pdf');
    await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
    await expect(runJob(jobId)).rejects.toThrow();

    expect(await settleFailedJob(testEnv, jobId)).toBe(true);
    expect(await getJob(testEnv.DB, jobId)).toMatchObject({ step: 'done', status: 'done' });
  });

  it("leaves a shopper's job to the queue", async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Покупатель' });
    expect(await settleFailedJob(testEnv, jobId)).toBe(false);
  });
});
