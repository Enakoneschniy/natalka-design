import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { regenerateSection, settleFailedJob } from '../src/pro/lifecycle';
import { readingRow, readingView } from '../src/pro/readings';
import { armFailure, runJob, testEnv } from './env';
import { readingFor } from './seed';

const view = async (id: string, accountId: string) =>
  readingView(testEnv, (await readingRow(testEnv.DB, id, accountId))!);

describe('regenerateSection', () => {
  it('rewrites a section, counts it, adds its cost and drops the stale PDF', async () => {
    const { account, id, jobId } = await readingFor('Переписать');
    await runJob(jobId);
    await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
    await runJob(jobId);
    const before = await view(id, account.id);
    const costBefore = (await getJob(testEnv.DB, jobId))?.cost_micros ?? 0;
    expect(before.pdf).toBe('ready');

    const result = await regenerateSection(testEnv, account.id, id, 'b');
    expect(result).toMatchObject({ status: 'ok', regenerations_left: 9 });

    const after = await view(id, account.id);
    expect(after.sections.find((s) => s.id === 'b')?.text).not.toBe(before.sections.find((s) => s.id === 'b')?.text);
    expect(after.sections.find((s) => s.id === 'a')?.text).toBe(before.sections.find((s) => s.id === 'a')?.text);
    expect(after.pdf).toBe('none');
    expect((await getJob(testEnv.DB, jobId))?.cost_micros).toBe(costBefore + 1000);
  });

  it('stops after ten paid rewrites', async () => {
    const { account, id, jobId } = await readingFor('Лимит');
    await runJob(jobId);
    for (let i = 0; i < 10; i++) {
      expect((await regenerateSection(testEnv, account.id, id, 'a')).status).toBe('ok');
    }
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'limit' });
  });

  it('freezes after the edit window', async () => {
    const { account, id, jobId } = await readingFor('Заморозка');
    await runJob(jobId);
    await testEnv.DB.prepare("UPDATE pro_readings SET editable_until = '2000-01-01T00:00:00.000Z' WHERE order_id = ?")
      .bind(id)
      .run();
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'frozen' });
  });

  it('fills a missing section free, even when frozen', async () => {
    const { account, id, jobId } = await readingFor('Пробел');
    await armFailure('Пробел|b');
    await expect(runJob(jobId)).rejects.toThrow();
    await settleFailedJob(testEnv, jobId);
    await testEnv.DB.prepare("UPDATE pro_readings SET editable_until = '2000-01-01T00:00:00.000Z' WHERE order_id = ?")
      .bind(id)
      .run();
    await armFailure('Пробел|b', 0);

    const result = await regenerateSection(testEnv, account.id, id, 'b');
    expect(result).toMatchObject({ status: 'ok', regenerations_left: 10 });
    const after = await view(id, account.id);
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(after.missing.map((m) => m.id)).toEqual(['c']);
  });

  it('gives the rewrite back when the model fails', async () => {
    const { account, id, jobId } = await readingFor('Отказ');
    await runJob(jobId);
    await armFailure('Отказ|a', 1);
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'failed' });
    expect((await view(id, account.id)).regenerations_left).toBe(10);
  });

  it('loses no text when two sections are rewritten at once', async () => {
    const { account, id, jobId } = await readingFor('Гонка');
    await runJob(jobId);
    const results = await Promise.all([
      regenerateSection(testEnv, account.id, id, 'a'),
      regenerateSection(testEnv, account.id, id, 'c'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.every((s) => s === 'ok' || s === 'busy')).toBe(true);
    const after = await view(id, account.id);
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    for (const r of results) {
      if (r.status === 'ok') expect(after.sections.find((s) => s.id === r.section.id)?.text).toBe(r.section.text);
    }
    expect(after.regenerations_left).toBe(10 - statuses.filter((s) => s === 'ok').length);
  });

  it('refuses while writing, for a stranger, and for an unknown section', async () => {
    const { account, id, jobId } = await readingFor('Рано');
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'not_ready' });
    await runJob(jobId);
    const stranger = await readingFor('Чужой');
    expect(await regenerateSection(testEnv, stranger.account.id, id, 'a')).toEqual({ status: 'not_found' });
    expect(await regenerateSection(testEnv, account.id, id, 'zzz')).toEqual({ status: 'not_found' });
  });

  it('never keeps a rewrite that lost the race for the same section', async () => {
    const { account, id, jobId } = await readingFor('Двойник');
    await runJob(jobId);
    const results = await Promise.all([
      regenerateSection(testEnv, account.id, id, 'a'),
      regenerateSection(testEnv, account.id, id, 'a'),
    ]);
    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 'ok' || s === 'busy')).toBe(true);
    const oks = statuses.filter((s) => s === 'ok').length;
    expect(oks).toBeGreaterThanOrEqual(1);
    expect((await view(id, account.id)).regenerations_left).toBe(10 - oks);
  });
});
