import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { assemblePdf, readingPdf, regenerateSection, settleFailedJob } from '../src/pro/lifecycle';
import { armFailure, runJob, testEnv } from './env';
import { readingFor } from './seed';

describe('assemblePdf', () => {
  it('queues the assembly once, and the PDF can be fetched after', async () => {
    const { account, id, jobId } = await readingFor('Сборщица');
    await runJob(jobId);
    expect(await assemblePdf(testEnv, account.id, id)).toBe('queued');
    expect(await assemblePdf(testEnv, account.id, id)).toBe('building');
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('pdf');
    expect(await readingPdf(testEnv, account.id, id)).toBeNull();

    await runJob(jobId);
    const pdf = await readingPdf(testEnv, account.id, id);
    expect(pdf?.filename).toMatch(/\.pdf$/);
    expect(new Uint8Array(await new Response(pdf?.body).arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('refuses while writing and with sections missing', async () => {
    const early = await readingFor('Ранняя');
    expect(await assemblePdf(testEnv, early.account.id, early.id)).toBe('not_ready');

    const gaps = await readingFor('Дыры');
    await armFailure('Дыры|c');
    await expect(runJob(gaps.jobId)).rejects.toThrow();
    await settleFailedJob(testEnv, gaps.jobId);
    expect(await assemblePdf(testEnv, gaps.account.id, gaps.id)).toBe('incomplete');
  });

  it('serves no PDF after a rewrite until it is assembled again', async () => {
    const { account, id, jobId } = await readingFor('Свежесть');
    await runJob(jobId);
    await assemblePdf(testEnv, account.id, id);
    await runJob(jobId);
    await regenerateSection(testEnv, account.id, id, 'a');
    expect(await readingPdf(testEnv, account.id, id)).toBeNull();
  });

  it("does not hand one seller another's PDF", async () => {
    const { account, id, jobId } = await readingFor('Владелица');
    await runJob(jobId);
    await assemblePdf(testEnv, account.id, id);
    await runJob(jobId);
    const stranger = await readingFor('Посторонняя');
    expect(await assemblePdf(testEnv, stranger.account.id, id)).toBe('not_found');
    expect(await readingPdf(testEnv, stranger.account.id, id)).toBeNull();
  });
});
