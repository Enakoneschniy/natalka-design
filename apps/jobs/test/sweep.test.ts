import { createScheduledController } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { sweep } from '../src/retention';
import { envWith, testEnv } from './env';
import { seedOrder } from './seed';

afterEach(() => vi.restoreAllMocks());

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

async function document(orderId: string, expiresAt: string): Promise<string> {
  const key = `${orderId}/${crypto.randomUUID()}.pdf`;
  await testEnv.DOCS.put(key, 'pdf');
  await testEnv.DB.prepare(
    `INSERT INTO documents (id, order_id, storage_key, sha256, pages, bytes, lang, expires_at, created_at)
     VALUES (?, ?, ?, 'x', 1, 3, 'ru', ?, ?)`,
  )
    .bind(crypto.randomUUID(), orderId, key, expiresAt, daysAgo(31))
    .run();
  return key;
}

const exists = async (sql: string, ...values: unknown[]) => Boolean(await testEnv.DB.prepare(sql).bind(...values).first());

describe('the nightly sweep', () => {
  it('deletes expired documents in batches, rows and then their objects', async () => {
    quiet();
    const { orderId } = await seedOrder({ pro: false, name: 'Документы' });
    const old = [await document(orderId, daysAgo(1)), await document(orderId, daysAgo(2)), await document(orderId, daysAgo(3))];
    const kept = await document(orderId, new Date(Date.now() + 86_400_000).toISOString());

    const report = await sweep(testEnv, { batch: 2 });
    expect(report.documents).toBe(3);
    for (const key of old) {
      expect(await exists('SELECT 1 FROM documents WHERE storage_key = ?', key)).toBe(false);
      expect(await testEnv.DOCS.get(key)).toBeNull();
    }
    expect(await testEnv.DOCS.get(kept)).not.toBeNull();
  });

  it('deletes the rows even when storage refuses to delete the objects', async () => {
    quiet();
    const { orderId } = await seedOrder({ pro: false, name: 'Хранилище' });
    const key = await document(orderId, daysAgo(1));
    const report = await sweep(envWith('DOCS', { delete: async () => Promise.reject(new Error('storage down')) }));
    expect(report.documents).toBe(1);
    expect(await exists('SELECT 1 FROM documents WHERE storage_key = ?', key)).toBe(false);
  });

  it('runs every other step when one of them fails', async () => {
    quiet();
    await testEnv.DB.prepare(
      "INSERT INTO previews (key, lang, blocks, created_at, expires_at) VALUES ('old-preview', 'ru', '[]', ?, ?)",
    )
      .bind(daysAgo(40), daysAgo(10))
      .run();
    const failing = new Proxy(testEnv.DB, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'prepare') {
          return (sql: string) => {
            if (sql.includes('telegram_links')) throw new Error('telegram table is locked');
            return (value as D1Database['prepare']).call(target, sql);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const report = await sweep(envWith('DB', failing));
    expect(report['telegram links']).toBe('failed');
    expect(report.previews).toBe(1);
    expect(report['letter log']).toEqual(expect.any(Number));
  });

  it('drops unpaid orders a week after their last payment page, with their charts and jobs', async () => {
    quiet();
    const order = async (name: string, status: string, hold: string | null, created: number, checkout: number | null) => {
      const seeded = await seedOrder({ pro: false, name, createdAt: daysAgo(created) });
      await testEnv.DB.prepare('UPDATE orders SET status = ?, hold = ?, checkout_at = ? WHERE id = ?')
        .bind(status, hold, checkout === null ? null : daysAgo(checkout), seeded.orderId)
        .run();
      return seeded.orderId;
    };
    const abandoned = await order('Брошен', 'pending', null, 8, null);
    const reopened = await order('Вернулся', 'pending', null, 8, 2);
    const fresh = await order('Свежий', 'pending', null, 2, 2);
    const wrongAmount = await order('Сумма', 'pending', 'amount_mismatch', 9, 9);
    const paid = await order('Оплачен', 'paid', null, 9, 9);
    const seller = await seedOrder({ pro: true, name: 'Продавец', createdAt: daysAgo(9) });

    await sweep(testEnv);
    for (const id of [abandoned, wrongAmount]) {
      expect(await exists('SELECT 1 FROM orders WHERE id = ?', id)).toBe(false);
      expect(await exists('SELECT 1 FROM charts WHERE order_id = ?', id)).toBe(false);
      expect(await exists('SELECT 1 FROM jobs WHERE order_id = ?', id)).toBe(false);
    }
    for (const id of [reopened, fresh, paid, seller.orderId]) {
      expect(await exists('SELECT 1 FROM orders WHERE id = ?', id), id).toBe(true);
    }
  });

  it("erases a paid order's address after half a year, and keeps the order", async () => {
    quiet();
    const aged = async (name: string, status: string, days: number, pro = false) => {
      const seeded = await seedOrder({ pro, name, createdAt: daysAgo(days) });
      await testEnv.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, seeded.orderId).run();
      return seeded.orderId;
    };
    const old = await aged('Давний', 'paid', 181);
    const refunded = await aged('Возврат', 'refunded', 200);
    const recent = await aged('Недавний', 'paid', 179);
    const seller = await aged('Продавец', 'paid', 400, true);
    await sweep(testEnv);
    const email = async (id: string) =>
      (await testEnv.DB.prepare('SELECT email FROM orders WHERE id = ?').bind(id).first<{ email: string }>())?.email;
    expect(await email(old)).toBe('');
    expect(await email(refunded)).toBe('');
    expect(await email(recent)).toBe('buyer@seed.test');
    expect(await email(seller)).toBe('buyer@seed.test');
  });

  it('drops Telegram link codes after thirty days and old job errors, tombstones and letter counts', async () => {
    quiet();
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Телеграм' });
    const link = (code: string, days: number) =>
      testEnv.DB.prepare('INSERT INTO telegram_links (code, order_id, job_id, locale, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(code, orderId, jobId, 'ru', daysAgo(days))
        .run();
    await link('old-code', 31);
    await link('new-code', 29);
    await testEnv.DB.prepare("UPDATE jobs SET last_error = '/v1/section → 503', updated_at = ? WHERE id = ?").bind(daysAgo(31), jobId).run();
    await testEnv.DB.prepare("INSERT INTO stripe_tombstones VALUES ('pi_old', 'refund', 'ch_old', ?), ('pi_new', 'refund', 'ch_new', ?)")
      .bind(daysAgo(31), daysAgo(1))
      .run();
    await testEnv.DB.prepare("INSERT INTO mail_log VALUES ('m-old', 'subconfirm', 'h', ?), ('m-new', 'subconfirm', 'h', ?)")
      .bind(daysAgo(3), daysAgo(0))
      .run();

    await sweep(testEnv);
    expect(await exists("SELECT 1 FROM telegram_links WHERE code = 'old-code'")).toBe(false);
    expect(await exists("SELECT 1 FROM telegram_links WHERE code = 'new-code'")).toBe(true);
    expect(await exists('SELECT 1 FROM jobs WHERE id = ? AND last_error IS NULL', jobId)).toBe(true);
    expect(await exists("SELECT 1 FROM stripe_tombstones WHERE payment_intent = 'pi_old'")).toBe(false);
    expect(await exists("SELECT 1 FROM stripe_tombstones WHERE payment_intent = 'pi_new'")).toBe(true);
    expect(await exists("SELECT 1 FROM mail_log WHERE id = 'm-old'")).toBe(false);
    expect(await exists("SELECT 1 FROM mail_log WHERE id = 'm-new'")).toBe(true);
  });

  it('clears chart names and places a worker from before this one still wrote', async () => {
    quiet();
    const { orderId } = await seedOrder({ pro: false, name: 'Метка' });
    await testEnv.DB.prepare("UPDATE charts SET display_name = 'Метка', place_label = 'Город' WHERE order_id = ?").bind(orderId).run();
    await sweep(testEnv);
    expect(await testEnv.DB.prepare('SELECT display_name, place_label FROM charts WHERE order_id = ?').bind(orderId).first()).toEqual({
      display_name: null,
      place_label: null,
    });
  });

  it('is what the nightly cron runs', async () => {
    quiet();
    const { orderId } = await seedOrder({ pro: false, name: 'Крон' });
    const key = await document(orderId, daysAgo(1));
    await worker.scheduled(createScheduledController({ cron: '17 3 * * *' }), testEnv);
    expect(await testEnv.DOCS.get(key)).toBeNull();
  });
});
