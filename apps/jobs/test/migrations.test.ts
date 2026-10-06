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
    // A seller with a client, a reading and a sign-in link.
    db.prepare("INSERT INTO pro_accounts (id, email, name, created_at) VALUES ('a1', 'seller@replay.test', 'Продавец', ?)").bind(ts),
    db.prepare(
      "INSERT INTO pro_login_tokens (token_hash, email, expires_at, created_at, purpose) VALUES ('t1', 'seller@replay.test', ?, ?, 'login')",
    ).bind(ts, ts),
    db.prepare(
      "INSERT INTO pro_clients (id, account_id, birth_ciphertext, birth_nonce, consent_at, created_at) VALUES ('pc1', 'a1', ?, ?, ?, ?)",
    ).bind(blob, blob, ts, ts),
    db.prepare(
      `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at, paid_at)
       VALUES ('o3', 'seller@replay.test', 'natal', 'ru', 1, 'credit', 'paid', 'a1', ?, ?)`,
    ).bind(ts, ts),
    db.prepare(
      "INSERT INTO jobs (id, order_id, kind, step, status, created_at, updated_at) VALUES ('j3', 'o3', 'natal', 'done', 'done', ?, ?)",
    ).bind(ts, ts),
    db.prepare(
      `INSERT INTO pro_readings (order_id, account_id, job_id, client_id, editable_until, created_at)
       VALUES ('o3', 'a1', 'j3', 'pc1', ?, ?)`,
    ).bind(ts, ts),
    db.prepare(
      `INSERT INTO pro_purchases (id, account_id, pack, credits, amount_minor, currency, status, stripe_payment_intent, created_at, paid_at)
       VALUES ('pp1', 'a1', 'p10', 10, 9900, 'EUR', 'paid', 'pi_pp1', ?, ?)`,
    ).bind(ts, ts),
  ]);
}

describe('the migrations of this release', () => {
  it('keep every row of the tables they touch, and fill in what the new code reads', async () => {
    const all = bindings.TEST_MIGRATIONS;
    expect(all.some((m) => m.name.startsWith('0014'))).toBe(true);
    await applyD1Migrations(db, all.filter((m) => m.name < '0014'));
    await seedProduction();
    const tables = [
      'orders',
      'charts',
      'jobs',
      'documents',
      'email_events',
      'telegram_links',
      'subscriptions',
      'horoscopes',
      'telegram_subscriptions',
      'pro_accounts',
      'pro_login_tokens',
      'pro_clients',
      'pro_readings',
      'pro_purchases',
    ];
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
    expect(await db.prepare("SELECT email, purpose, requester FROM pro_login_tokens WHERE token_hash = 't1'").first()).toEqual({
      email: 'seller@replay.test',
      purpose: 'login',
      requester: null,
    });
    expect(await db.prepare("SELECT regenerations, busy_until FROM pro_readings WHERE order_id = 'o3'").first()).toEqual({
      regenerations: 0,
      busy_until: null,
    });
    expect(await db.prepare("SELECT email, name, closed_at FROM pro_accounts WHERE id = 'a1'").first()).toEqual({
      email: 'seller@replay.test',
      name: 'Продавец',
      closed_at: null,
    });
    expect(await count('pro_attempts')).toBe(0);
    expect(await db.prepare("SELECT sections_planned, sections_written FROM jobs WHERE id = 'j3'").first()).toEqual({
      sections_planned: null,
      sections_written: null,
    });
    expect(await db.prepare("SELECT status, credits_taken FROM pro_purchases WHERE id = 'pp1'").first()).toEqual({
      status: 'paid',
      credits_taken: null,
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

    // The cabinet's own writes, as the worker before this release makes them.
    await db.batch([
      db.prepare(
        `INSERT INTO pro_login_tokens (token_hash, email, expires_at, created_at, purpose, signup_name, signup_invite)
         VALUES ('t2', 'new@replay.test', ?, ?, 'signup', 'Новая', NULL)`,
      ).bind(now, now),
      db.prepare("UPDATE pro_login_tokens SET used_at = ? WHERE token_hash = 't2' AND used_at IS NULL AND expires_at > ?").bind(now, ts),
      db.prepare(
        "INSERT INTO pro_accounts (id, email, name, terms_accepted_at, created_at) VALUES ('a2', 'new@replay.test', 'Новая', ?, ?) ON CONFLICT (email) DO NOTHING",
      ).bind(now, now),
      db.prepare("UPDATE pro_accounts SET session_epoch = session_epoch + 1 WHERE id = 'a2'"),
      db.prepare("UPDATE pro_readings SET regenerations = regenerations + 1 WHERE order_id = 'o3' AND regenerations < 10"),
    ]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = 'new@replay.test' AND created_at > ?").bind(ts).first()).toEqual({
      n: 1,
    });
    expect(await db.prepare("SELECT session_epoch FROM pro_accounts WHERE id = 'a2'").first()).toEqual({ session_epoch: 1 });
    expect(await db.prepare("SELECT regenerations FROM pro_readings WHERE order_id = 'o3'").first()).toEqual({ regenerations: 1 });
  });
});
