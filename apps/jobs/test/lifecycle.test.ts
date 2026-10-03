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
