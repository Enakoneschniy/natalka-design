import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptJson } from '../src/crypto';
import { sealLegacyPayloads, SEAL_ROUND } from '../src/pipeline';
import { sweep } from '../src/retention';
import { sealLegacyCharts } from '../src/subscriptions';
import { envWith, testEnv } from './env';
import { seedOrder } from './seed';

afterEach(() => vi.restoreAllMocks());

/** The worker's database with every statement it prepares written down. */
function recordingDatabase(): { db: D1Database; statements: string[] } {
  const statements: string[] = [];
  const db = new Proxy(testEnv.DB, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'prepare') {
        return (sql: string) => {
          statements.push(sql.replace(/\s+/g, ' ').trim());
          return target.prepare(sql);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db, statements };
}

/** `count` jobs of one order holding a plain payload each (`text` for all, or a plan of one); the
 * order's id. */
async function plainJobs(count: number, text?: string): Promise<string> {
  const { orderId } = await seedOrder({ pro: false, name: 'Старый текст' });
  const ts = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    await testEnv.DB.prepare(
      "INSERT INTO jobs (id, order_id, kind, step, status, payload, created_at, updated_at) VALUES (?, ?, 'natal', 'done', 'done', ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), orderId, text ?? JSON.stringify({ plan: [{ id: 'a', title: 'A', quote: false }], n: i }), ts, ts)
      .run();
  }
  return orderId;
}

const plainLeft = async (orderId: string) =>
  (
    await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM jobs WHERE payload IS NOT NULL AND order_id = ?')
      .bind(orderId)
      .first<{ n: number }>()
  )?.n ?? 0;

describe('the nightly encryption of old payloads', () => {
  it(`lists ids alone, ${SEAL_ROUND} at a time, and reads each payload by itself`, async () => {
    const mine = await plainJobs(2 * SEAL_ROUND + 20);
    const { db, statements } = recordingDatabase();
    expect(await sealLegacyPayloads(envWith('DB', db), 2 * SEAL_ROUND + 10)).toBe(2 * SEAL_ROUND + 10);

    const lists = statements.filter((sql) => sql.includes('WHERE payload IS NOT NULL'));
    expect(lists).toHaveLength(3);
    for (const sql of lists) expect(sql).toMatch(/^SELECT rowid AS at, id FROM jobs /);
    const reads = statements.filter((sql) => /^SELECT .*payload.* FROM jobs/.test(sql) && !sql.includes('IS NOT NULL'));
    expect(new Set(reads)).toEqual(new Set(['SELECT payload FROM jobs WHERE id = ?']));
    expect(reads).toHaveLength(2 * SEAL_ROUND + 10);

    while ((await sealLegacyPayloads(testEnv, 200)) > 0) {
      // the rest
    }
    expect(await plainLeft(mine)).toBe(0);
  });

  it('goes past payloads it cannot read instead of stopping at them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreadable = await plainJobs(SEAL_ROUND + 5, '{not json');
    const readable = await plainJobs(3);
    expect(await sealLegacyPayloads(testEnv, 200)).toBeGreaterThanOrEqual(3);
    expect(await plainLeft(readable)).toBe(0);
    expect(await plainLeft(unreadable)).toBe(SEAL_ROUND + 5);
    await testEnv.DB.prepare('DELETE FROM orders WHERE id = ?').bind(unreadable).run();
  });
});

describe('the nightly encryption of old subscription charts', () => {
  it('lists ids alone and reads each chart by itself', async () => {
    const ts = new Date().toISOString();
    const { ciphertext, nonce } = await encryptJson({ date: '1990-01-01' }, testEnv.DATA_KEY);
    for (let i = 0; i < 3; i++) {
      await testEnv.DB.prepare(
        `INSERT INTO subscriptions (id, email, locale, gender, display_name, cadence, chart_json, birth_ciphertext,
           birth_nonce, birth_expires_at, status, next_send_at, trial_ends_at, confirmed_at, created_at, updated_at)
         VALUES (?, ?, 'ru', 'f', 'Старая', 'week', ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), `seal-${i}@seal.test`, JSON.stringify({ positions: [], houses: null, i }), ciphertext, nonce, ts, ts, ts, ts, ts, ts)
        .run();
    }
    const { db, statements } = recordingDatabase();
    expect(await sealLegacyCharts(envWith('DB', db), 200)).toBeGreaterThanOrEqual(3);
    const lists = statements.filter((sql) => sql.includes("chart_json != ''"));
    for (const sql of lists) expect(sql).toMatch(/^SELECT rowid AS at, id FROM subscriptions /);
    const reads = statements.filter((sql) => /^SELECT .*chart_json.* FROM subscriptions/.test(sql) && !sql.includes("!= ''"));
    expect(new Set(reads)).toEqual(new Set(['SELECT chart_json, display_name FROM subscriptions WHERE id = ?']));
    const left = await testEnv.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE email LIKE 'seal-%' AND chart_json != ''").first<{
      n: number;
    }>();
    expect(left?.n).toBe(0);
  });
});

describe('the nightly sweep', () => {
  it('encrypts last, after every deletion', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = await sweep(testEnv);
    expect(Object.keys(report).slice(-2)).toEqual(['plain payloads encrypted', 'plain charts encrypted']);
  });
});
