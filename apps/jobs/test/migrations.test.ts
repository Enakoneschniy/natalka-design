import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

/** The migrations of this release are applied while the worker before it is still running, to a
 * database full of its rows. This replays that: the schema up to 0013, rows as production holds
 * them, then the rest — and checks that nothing is lost and the old worker's writes still work. */

const bindings = env as unknown as { REPLAY_DB: D1Database; TEST_MIGRATIONS: D1Migration[] };
const db = bindings.REPLAY_DB;
const ts = '2026-09-20T10:00:00.000Z';

const count = async (table: string) =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;

async function seedProduction(): Promise<void> {
  const blob = new Uint8Array([1, 2, 3]);
  await db.batch([
    db.prepare(
      `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, stripe_payment_intent, created_at, paid_at)
       VALUES ('o1', 'buyer@replay.test', 'natal', 'ru', 1900, 'EUR', 'paid', 'pi_1', ?, ?)`,
    ).bind(ts, ts),
    db.prepare(
      `INSERT INTO charts (id, order_id, person_no, birth_ciphertext, birth_nonce, unknown_time, gender, display_name, place_label, expires_at, created_at)
       VALUES ('c1', 'o1', 1, ?, ?, 0, 'f', 'Анна', 'Киев', ?, ?)`,
    ).bind(blob, blob, ts, ts),
    db.prepare(
      `INSERT INTO jobs (id, order_id, kind, step, status, payload, created_at, updated_at)
       VALUES ('j1', 'o1', 'natal', 'done', 'done', '{"plan":[]}', ?, ?)`,
    ).bind(ts, ts),
    db.prepare(
      `INSERT INTO documents (id, order_id, storage_key, sha256, pages, bytes, lang, expires_at, created_at)
       VALUES ('d1', 'o1', 'o1/natal-ru.pdf', 'x', 7, 4, 'ru', ?, ?)`,
    ).bind(ts, ts),
    db.prepare("INSERT INTO email_events (id, order_id, kind, status, created_at) VALUES ('e1', 'o1', 'ready', 'sent', ?)").bind(ts),
    db.prepare(
      "INSERT INTO telegram_links (code, order_id, job_id, locale, chat_id, created_at) VALUES ('code1', 'o1', 'j1', 'ru', 42, ?)",
    ).bind(ts),
    db.prepare(
      `INSERT INTO subscriptions (id, email, locale, gender, display_name, cadence, chart_json, status, next_send_at, created_at, updated_at)
       VALUES ('s1', 'sub@replay.test', 'ru', 'f', 'Вера', 'week', '{"positions":[]}', 'active', ?, ?, ?)`,
    ).bind(ts, ts, ts),
    db.prepare(
      `INSERT INTO subscriptions (id, email, locale, gender, cadence, chart_json, status, next_send_at, trial_ends_at, created_at, updated_at)
       VALUES ('s2', 'sub2@replay.test', 'ru', 'n', 'month', '{"positions":[]}', 'cancelled', ?, '2026-10-01T00:00:00.000Z', ?, ?)`,
    ).bind(ts, ts, ts),
    db.prepare(
      `INSERT INTO horoscopes (id, subscription_id, period, start_date, end_date, title, text, created_at)
       VALUES ('h1', 's1', 'week', '2026-09-20', '2026-09-27', 'Неделя', 'Текст', ?)`,
    ).bind(ts),
    db.prepare("INSERT INTO telegram_subscriptions (code, subscription_id, chat_id, created_at) VALUES ('tg1', 's1', 7, ?)").bind(ts),
  ]);
}

describe('the migrations of this release', () => {
  it('keep every row of the tables they touch, and fill in what the new code reads', async () => {
    const all = bindings.TEST_MIGRATIONS;
    expect(all.some((m) => m.name.startsWith('0014'))).toBe(true);
    await applyD1Migrations(db, all.filter((m) => m.name < '0014'));
    await seedProduction();
    const tables = ['orders', 'charts', 'jobs', 'documents', 'email_events', 'telegram_links', 'subscriptions', 'horoscopes', 'telegram_subscriptions'];
    const before = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await count(t)] as const)));

    await applyD1Migrations(db, all);
    for (const table of tables) expect(await count(table), table).toBe(before[table]);

    expect(await db.prepare("SELECT status, hold, checkout_at, email FROM orders WHERE id = 'o1'").first()).toEqual({
      status: 'paid',
      hold: null,
      checkout_at: null,
      email: 'buyer@replay.test',
    });
    expect(await db.prepare("SELECT display_name, place_label FROM charts WHERE id = 'c1'").first()).toEqual({
      display_name: null,
      place_label: null,
    });
    expect(
      await db.prepare("SELECT payload, payload_ct, payload_nonce, lease_until, lease_by FROM jobs WHERE id = 'j1'").first(),
    ).toEqual({ payload: '{"plan":[]}', payload_ct: null, payload_nonce: null, lease_until: null, lease_by: null });
    expect(await db.prepare("SELECT confirmed_at, trial_ends_at, ended_at FROM subscriptions WHERE id = 's1'").first()).toEqual({
      confirmed_at: ts,
      trial_ends_at: '2026-10-20T10:00:00.000Z',
      ended_at: null,
    });
    expect(await db.prepare("SELECT confirmed_at, trial_ends_at FROM subscriptions WHERE id = 's2'").first()).toEqual({
      confirmed_at: ts,
      trial_ends_at: '2026-10-01T00:00:00.000Z',
    });
  });

  it("leave the previous worker's own writes working while it still runs", async () => {
    const now = new Date().toISOString();
    const blob = new Uint8Array([9]);
    // Exactly the statements the worker before this release runs.
    await db.batch([
      db.prepare(
        `INSERT INTO orders (id, email, product, locale, country, amount_minor, currency, status, variant, consent, source, created_at)
         VALUES ('o2', 'b@replay.test', 'natal', 'ru', NULL, 1900, 'EUR', 'pending', NULL, NULL, NULL, ?)`,
      ).bind(now),
      db.prepare(
        `INSERT INTO charts (id, order_id, person_no, birth_ciphertext, birth_nonce, key_version, unknown_time, gender, display_name, place_label, expires_at, created_at)
         VALUES ('c2', 'o2', 1, ?, ?, 1, 0, 'f', 'Имя', 'Место', ?, ?)`,
      ).bind(blob, blob, now, now),
      db.prepare("INSERT INTO jobs (id, order_id, kind, step, status, created_at, updated_at) VALUES ('j2', 'o2', 'natal', 'calc', 'queued', ?, ?)").bind(now, now),
      db.prepare(
        "UPDATE orders SET status = 'paid', paid_at = ?, stripe_payment_intent = 'pi_2' WHERE id = 'o2' AND status = 'pending'",
      ).bind(now),
      db.prepare("UPDATE jobs SET payload = '{}', updated_at = ? WHERE id = 'j2'").bind(now),
      db.prepare(
        `INSERT INTO subscriptions (id, email, locale, gender, display_name, cadence, chart_json, birth_ciphertext,
           birth_nonce, birth_expires_at, status, next_send_at, trial_ends_at, created_at, updated_at)
         VALUES ('s3', 'c@replay.test', 'ru', 'f', 'Имя', 'week', '{}', ?, ?, ?, 'active', ?, ?, ?, ?)`,
      ).bind(blob, blob, now, now, now, now, now),
    ]);
    expect(await db.prepare("SELECT status FROM orders WHERE id = 'o2'").first()).toEqual({ status: 'paid' });
    expect(await count('subscriptions')).toBe(3);
  });
});
