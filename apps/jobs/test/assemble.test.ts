import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJob } from '../src/db';
import { issueSession } from '../src/pro/auth';
import { saveBrand } from '../src/pro/brand';
import { ASSEMBLIES_PER_HOUR, assemblePdf, readingPdf, regenerateSection, settleFailedJob } from '../src/pro/lifecycle';
import { handlePro } from '../src/pro/routes';
import { armFailure, envWith, runJob, testEnv } from './env';
import { readingFor } from './seed';

const BRAND = { name: 'Тест', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' };

describe('assemblePdf', () => {
  it('queues the assembly once, and the PDF can be fetched after', async () => {
    const { account, id, jobId } = await readingFor('Сборщица');
    await runJob(jobId);
    await saveBrand(testEnv, account.id, BRAND);
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
    await saveBrand(testEnv, account.id, BRAND);
    await assemblePdf(testEnv, account.id, id);
    await runJob(jobId);
    await regenerateSection(testEnv, account.id, id, 'a');
    expect(await readingPdf(testEnv, account.id, id)).toBeNull();
  });

  it("does not hand one seller another's PDF", async () => {
    const { account, id, jobId } = await readingFor('Владелица');
    await runJob(jobId);
    await saveBrand(testEnv, account.id, BRAND);
    await assemblePdf(testEnv, account.id, id);
    await runJob(jobId);
    const stranger = await readingFor('Посторонняя');
    expect(await assemblePdf(testEnv, stranger.account.id, id)).toBe('not_found');
    expect(await readingPdf(testEnv, stranger.account.id, id)).toBeNull();
  });
});

describe('assembling one reading again and again', () => {
  afterEach(() => vi.restoreAllMocks());

  /** What a queued assembly leaves behind once it has run: the reading done again. */
  const assembled = (jobId: string) =>
    testEnv.DB.prepare("UPDATE jobs SET step = 'done', status = 'done' WHERE id = ?").bind(jobId).run();

  const counted = async (orderId: string) =>
    (
      await testEnv.DB.prepare("SELECT COUNT(*) AS n FROM pro_attempts WHERE kind = 'pdf' AND subject = ?")
        .bind(orderId)
        .first<{ n: number }>()
    )?.n ?? 0;

  it(`stops after ${ASSEMBLIES_PER_HOUR} an hour, with 429 over HTTP, until the hour has passed`, async () => {
    const { account, id, jobId } = await readingFor('Пересборка');
    await runJob(jobId);
    await saveBrand(testEnv, account.id, BRAND);
    for (let i = 0; i < ASSEMBLIES_PER_HOUR; i++) {
      expect(await assemblePdf(testEnv, account.id, id)).toBe('queued');
      await assembled(jobId);
    }
    expect(await assemblePdf(testEnv, account.id, id)).toBe('too_many');
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('done');

    const request = new Request(`https://jobs.test/v1/pro/readings/${id}/pdf`, {
      method: 'POST',
      headers: { 'x-pro-key': 'test-pro-key', authorization: `Bearer ${await issueSession(testEnv, account)}` },
    });
    const response = await handlePro(request, testEnv, new URL(request.url));
    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: 'too_many' });

    await testEnv.DB.prepare("UPDATE pro_attempts SET created_at = ? WHERE kind = 'pdf' AND subject = ?")
      .bind(new Date(Date.now() - 61 * 60 * 1000).toISOString(), id)
      .run();
    expect(await assemblePdf(testEnv, account.id, id)).toBe('queued');
  });

  it('counts only the assemblies that were queued', async () => {
    const { account, id, jobId } = await readingFor('Учётная');
    await runJob(jobId);
    expect(await assemblePdf(testEnv, account.id, id)).toBe('no_brand');
    await saveBrand(testEnv, account.id, BRAND);
    expect(await assemblePdf(testEnv, account.id, id)).toBe('queued');
    expect(await assemblePdf(testEnv, account.id, id)).toBe('building');
    await assembled(jobId);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refusing = envWith('JOBS', { send: async () => Promise.reject(new Error('queue down')) });
    await expect(assemblePdf(refusing, account.id, id)).rejects.toThrow('queue down');
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('done');
    expect(await counted(id)).toBe(1);
  });

  it("counts by reading: the seller's other readings are not held back", async () => {
    const first = await readingFor('Первая сборка');
    await runJob(first.jobId);
    await saveBrand(testEnv, first.account.id, BRAND);
    for (let i = 0; i < ASSEMBLIES_PER_HOUR; i++) {
      await assemblePdf(testEnv, first.account.id, first.id);
      await assembled(first.jobId);
    }
    expect(await assemblePdf(testEnv, first.account.id, first.id)).toBe('too_many');

    const other = await readingFor('Вторая сборка');
    await runJob(other.jobId);
    await saveBrand(testEnv, other.account.id, BRAND);
    expect(await assemblePdf(testEnv, other.account.id, other.id)).toBe('queued');
  });
});
