import { afterEach, describe, expect, it, vi } from 'vitest';
import { sweep } from '../src/retention';
import { testEnv } from './env';

afterEach(() => vi.restoreAllMocks());

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const exists = async (id: string) =>
  Boolean(await testEnv.DB.prepare('SELECT 1 FROM pro_attempts WHERE id = ?').bind(id).first());

describe("the nightly sweep of the cabinet's limits", () => {
  it('drops tries older than a day and keeps the recent ones', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const add = (id: string, at: string) =>
      testEnv.DB.prepare("INSERT INTO pro_attempts (id, kind, subject, created_at) VALUES (?, 'invite', 'acc-sweep', ?)")
        .bind(id, at)
        .run();
    await add('try-old', hoursAgo(25));
    await add('try-recent', hoursAgo(2));

    const report = await sweep(testEnv);
    expect(report['cabinet attempts']).toEqual(expect.any(Number));
    expect(await exists('try-old')).toBe(false);
    expect(await exists('try-recent')).toBe(true);
  });
});
