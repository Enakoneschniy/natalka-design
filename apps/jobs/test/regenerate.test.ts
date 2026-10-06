import { SELF } from 'cloudflare:test';
import { saveBrand } from '../src/pro/brand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJob } from '../src/db';
import { issueSession } from '../src/pro/auth';
import { regenerateSection, settleFailedJob } from '../src/pro/lifecycle';
import { readingRow, readingView } from '../src/pro/readings';
import { armFailure, envWith, lastRequest, runJob, testEnv } from './env';
import { readingFor } from './seed';

const view = async (id: string, accountId: string) =>
  readingView(testEnv, (await readingRow(testEnv.DB, id, accountId))!);

describe('regenerateSection', () => {
  it('rewrites a section, counts it, adds its cost and drops the stale PDF', async () => {
    const { account, id, jobId } = await readingFor('Переписать');
    await runJob(jobId);
    await saveBrand(testEnv, account.id, { name: 'Тест', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' });
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

describe('a reading being rewritten', () => {
  afterEach(() => vi.restoreAllMocks());

  const busyUntil = async (id: string) =>
    (
      await testEnv.DB.prepare('SELECT busy_until FROM pro_readings WHERE order_id = ?')
        .bind(id)
        .first<{ busy_until: string | null }>()
    )?.busy_until;

  /** The text API with every call counted, and held until `release()`. */
  function heldModel() {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const counter = { calls: 0 };
    const env = envWith('API', {
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        counter.calls++;
        await gate;
        return testEnv.API.fetch(input, init);
      },
    });
    return { env, counter, release };
  }

  it('is busy for a second request while the first is with the model, which is called once', async () => {
    const { account, id, jobId } = await readingFor('Занятая');
    await runJob(jobId);
    const { env, counter, release } = heldModel();

    const first = regenerateSection(env, account.id, id, 'a');
    await vi.waitFor(() => expect(counter.calls).toBe(1));
    expect(await busyUntil(id)).toBeTruthy();
    expect(await regenerateSection(env, account.id, id, 'c')).toEqual({ status: 'busy' });
    expect(await regenerateSection(env, account.id, id, 'a')).toEqual({ status: 'busy' });
    expect(counter.calls).toBe(1);

    release();
    expect((await first).status).toBe('ok');
    expect(await busyUntil(id)).toBeNull();
    expect((await view(id, account.id)).regenerations_left).toBe(9);
    expect((await regenerateSection(env, account.id, id, 'c')).status).toBe('ok');
  });

  it('calls no model and spends no rewrite while another holds it, and answers 409 busy', async () => {
    const { account, id, jobId } = await readingFor('Удержанная');
    await runJob(jobId);
    const before = await lastRequest('/v1/section|Удержанная');
    await testEnv.DB.prepare('UPDATE pro_readings SET busy_until = ? WHERE order_id = ?')
      .bind(new Date(Date.now() + 60_000).toISOString(), id)
      .run();

    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'busy' });
    const response = await rewriteOverHttp(id, 'a', await issueSession(testEnv, account));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'busy' });
    expect(await lastRequest('/v1/section|Удержанная')).toEqual(before);
    expect((await view(id, account.id)).regenerations_left).toBe(10);
  });

  it('is taken over once a hold that was never let go has run out', async () => {
    const { account, id, jobId } = await readingFor('Брошенная');
    await runJob(jobId);
    await testEnv.DB.prepare('UPDATE pro_readings SET busy_until = ? WHERE order_id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), id)
      .run();
    expect((await regenerateSection(testEnv, account.id, id, 'a')).status).toBe('ok');
    expect(await busyUntil(id)).toBeNull();
  });

  it('is let go however the rewrite ends', async () => {
    const { account, id, jobId } = await readingFor('Отпущенная');
    await runJob(jobId);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await armFailure('Отпущенная|a', 1);
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'failed' });
    expect(await busyUntil(id)).toBeNull();
    expect(await regenerateSection(testEnv, account.id, id, 'zzz')).toEqual({ status: 'not_found' });
    expect(await busyUntil(id)).toBeNull();
    await testEnv.DB.prepare("UPDATE pro_readings SET editable_until = '2000-01-01T00:00:00.000Z' WHERE order_id = ?")
      .bind(id)
      .run();
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'frozen' });
    expect(await busyUntil(id)).toBeNull();
  });

  it("is not held for another seller's request", async () => {
    const { id, jobId } = await readingFor('Своя');
    await runJob(jobId);
    const stranger = await readingFor('Чужая');
    expect(await regenerateSection(testEnv, stranger.account.id, id, 'a')).toEqual({ status: 'not_found' });
    expect(await busyUntil(id)).toBeNull();
  });

});

/** The rewrite route over HTTP, as the cabinet calls it. */
function rewriteOverHttp(id: string, section: string, session: string) {
  return SELF.fetch(`https://jobs.test/v1/pro/readings/${id}/sections/${section}/regenerate`, {
    method: 'POST',
    headers: { 'x-pro-key': 'test-pro-key', authorization: `Bearer ${session}` },
  });
}
