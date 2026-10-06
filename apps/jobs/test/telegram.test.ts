import { createExecutionContext, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { signLink } from '../src/crypto';
import { JobsInternal } from '../src/index';
import { forgetTelegramSubscriptions, claimTelegramSubscription, telegramCodeForSubscription } from '../src/subscriptions';
import { testEnv } from './env';
import { seedOrder } from './seed';

const bot = () => new JobsInternal(createExecutionContext(), testEnv);

async function codeFor(orderId: string, jobId: string): Promise<string> {
  const token = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 600);
  const response = await SELF.fetch(`https://jobs.test/v1/jobs/${token}/telegram`, {
    method: 'POST',
    headers: { 'x-site-key': 'test-site-key' },
  });
  return ((await response.json()) as { code: string }).code;
}

describe("a document's Telegram code", () => {
  it('belongs to the first chat that opens it', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Телеграм' });
    const code = await codeFor(orderId, jobId);
    expect(await bot().claimTelegram(code, 111)).toMatchObject({ kind: 'document', ready: false });
    expect(await bot().claimTelegram(code, 222)).toBeNull();
    expect(await bot().claimTelegram(code, 111)).toMatchObject({ kind: 'document' });
    const row = await testEnv.DB.prepare('SELECT chat_id FROM telegram_links WHERE code = ?').bind(code).first();
    expect(row).toEqual({ chat_id: 111 });
  });

  it('works for thirty days, and the site is given a fresh one after', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Старый код' });
    const code = await codeFor(orderId, jobId);
    expect(await codeFor(orderId, jobId)).toBe(code);
    await testEnv.DB.prepare('UPDATE telegram_links SET created_at = ? WHERE code = ?')
      .bind(new Date(Date.now() - 31 * 86_400_000).toISOString(), code)
      .run();
    expect(await bot().claimTelegram(code, 333)).toBeNull();
    const fresh = await codeFor(orderId, jobId);
    expect(fresh).not.toBe(code);
    expect(await bot().claimTelegram(fresh, 333)).toMatchObject({ kind: 'document' });
  });
});

describe("a subscription's Telegram code", () => {
  it('belongs to one chat until that chat lets it go', async () => {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO subscriptions (id, email, locale, cadence, chart_json, status, next_send_at, trial_ends_at,
         confirmed_at, created_at, updated_at)
       VALUES (?, 'tg@subs.test', 'ru', 'week', '', 'active', ?, ?, ?, ?, ?)`,
    )
      .bind(id, ts, ts, ts, ts, ts)
      .run();
    const code = await telegramCodeForSubscription(testEnv.DB, id);
    expect(await claimTelegramSubscription(testEnv.DB, code, 1)).toMatchObject({ id });
    expect(await claimTelegramSubscription(testEnv.DB, code, 2)).toBeNull();
    await forgetTelegramSubscriptions(testEnv.DB, 1);
    expect(await claimTelegramSubscription(testEnv.DB, code, 2)).toMatchObject({ id });
  });
});
