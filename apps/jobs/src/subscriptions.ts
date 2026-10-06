import { type Blobish, decryptJson, encryptJson, readLink, signLink } from './crypto';
import { expiryFrom, now } from './db';
import type { Env } from './env';
import { errorCode, UpstreamError } from './errors';
import { sendHoroscope } from './mail';
import { apiFetch, ephemeris } from './pipeline';

/* The horoscope subscription: a chart kept on file, a cadence, and a channel or two.
 *
 * Nothing here needs the birth data after the chart is computed. It is kept, encrypted, for
 * thirty days — the window in which a wrong birth time gets noticed — and then dropped by the
 * sweep, while the chart and the subscription live on. */

export type Cadence = 'week' | 'month';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface SubscriptionRow {
  id: string;
  email: string | null;
  locale: string;
  gender: 'f' | 'm' | 'n';
  display_name: string | null;
  cadence: Cadence;
  chart_json: string;
  birth_ciphertext: Blobish | null;
  birth_nonce: Blobish | null;
  birth_expires_at: string | null;
  status: SubscriptionStatus;
  next_send_at: string;
  send_hour_utc: number;
  trial_ends_at: string | null;
  created_at: string;
}

export interface HoroscopeRow {
  id: string;
  period: Cadence;
  start_date: string;
  end_date: string;
  title: string;
  text: string;
  created_at: string;
}

interface BirthInput {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  name: string;
  gender: 'f' | 'm' | 'n';
}

export interface CreateSubscription {
  email?: string;
  locale: string;
  cadence: Cadence;
  birth: BirthInput;
}

/** How long a wrong birth time can still be corrected. */
const CORRECTION_DAYS = 30;
/** The free month. */
const TRIAL_DAYS = 30;
/** Management links outlive documents: a year, renewed by every letter that carries one. */
const MANAGE_TTL_SECONDS = 365 * 24 * 60 * 60;

const texts = async <T>(env: Env, path: string, body: unknown): Promise<T> => {
  const response = await apiFetch(env, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new UpstreamError(path, response.status);
  return response.json() as Promise<T>;
};

export async function manageToken(env: Env, id: string): Promise<string> {
  return signLink('sub', { sub: id }, env.LINK_KEY, MANAGE_TTL_SECONDS);
}

export async function subscriptionFromToken(
  env: Env,
  token: string,
): Promise<SubscriptionRow | null> {
  const claims = await readLink('sub', token, env.LINK_KEY);
  if (!claims) return null;
  return getSubscription(env.DB, claims.sub);
}

export async function getSubscription(db: D1Database, id: string): Promise<SubscriptionRow | null> {
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(id).first<SubscriptionRow>();
}

/** Computes the chart once and keeps only what the horoscope needs of it. */
export async function createSubscription(env: Env, input: CreateSubscription): Promise<string> {
  const facts = await ephemeris<{ positions: unknown[]; houses: unknown }>(env, '/v1/calc', {
    date: input.birth.date,
    time: input.birth.time,
    latitude: input.birth.latitude,
    longitude: input.birth.longitude,
    zone: input.birth.zone,
  });
  const chart = { positions: facts.positions, houses: facts.houses ?? null };
  const { ciphertext, nonce } = await encryptJson(input.birth, env.DATA_KEY);
  const id = crypto.randomUUID();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, email, locale, gender, display_name, cadence, chart_json,
       birth_ciphertext, birth_nonce, birth_expires_at, status, next_send_at, trial_ends_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.email ?? null,
      input.locale,
      input.birth.gender,
      input.birth.name || null,
      input.cadence,
      JSON.stringify(chart),
      ciphertext,
      nonce,
      expiryFrom(CORRECTION_DAYS),
      // The first one goes out at once; the queue picks it up in seconds.
      ts,
      expiryFrom(TRIAL_DAYS),
      ts,
      ts,
    )
    .run();
  return id;
}

export async function updateSubscription(
  db: D1Database,
  id: string,
  patch: { cadence?: Cadence; status?: SubscriptionStatus; email?: string | null },
): Promise<void> {
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now()];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db
    .prepare(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteSubscription(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();
}

export async function latestHoroscope(
  db: D1Database,
  subscriptionId: string,
): Promise<HoroscopeRow | null> {
  return db
    .prepare(
      `SELECT id, period, start_date, end_date, title, text, created_at FROM horoscopes
       WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(subscriptionId)
    .first<HoroscopeRow>();
}

/** Subscriptions whose next horoscope is due. */
export async function dueSubscriptions(db: D1Database): Promise<{ id: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT id FROM subscriptions WHERE status = 'active' AND next_send_at <= ? LIMIT 200`,
    )
    .bind(now())
    .all<{ id: string }>();
  return results;
}

/** The next send: the same hour, seven days or one month on, from the send just made rather than
 * from now, so a delayed run does not drift the schedule. */
function nextSendAfter(sent: Date, cadence: Cadence, hourUtc: number): string {
  const next = new Date(sent);
  if (cadence === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCHours(hourUtc, 0, 0, 0);
  return next.toISOString();
}

interface HoroscopeResult {
  title: string;
  text: string;
  period: Cadence;
  start: string;
  end: string;
  cost_micros: number;
  problems: string[];
}

/** Writes the horoscope that is due and sends it wherever the subscription points. */
export async function deliverHoroscope(env: Env, id: string): Promise<void> {
  const sub = await getSubscription(env.DB, id);
  if (!sub || sub.status !== 'active') return;
  // The queue may hand the same subscription over twice; only one horoscope per window.
  const latest = await latestHoroscope(env.DB, id);
  const today = now().slice(0, 10);
  if (latest && latest.start_date === today && latest.period === sub.cadence) {
    await updateSubscription(env.DB, id, {});
    return;
  }

  const chart = JSON.parse(sub.chart_json) as {
    positions: { body: string; longitude: number }[];
    houses: { cusps: { longitude: number }[] } | null;
  };
  // The window is computed by the ephemeris service; the text worker only writes.
  const end = new Date(`${today}T00:00:00Z`);
  if (sub.cadence === 'week') end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCDate(end.getUTCDate() + 30);
  const endDate = end.toISOString().slice(0, 10);
  const longitudes = Object.fromEntries(chart.positions.map((p) => [p.body, p.longitude]));
  const [transits, sky] = await Promise.all([
    ephemeris<{ events: unknown[] }>(env, '/v1/transits', {
      longitudes,
      start: today,
      end: endDate,
    }),
    ephemeris<{ positions: unknown[] }>(env, '/v1/sky', {
      when: `${today}T00:00:00Z`,
      cusps: chart.houses?.cusps.map((c) => c.longitude),
    }),
  ]);
  const result = await texts<HoroscopeResult>(env, '/v1/horoscope', {
    facts: chart,
    transits: transits.events,
    sky: sky.positions,
    period: sub.cadence,
    start: today,
    end: endDate,
    lang: sub.locale,
    gender: sub.gender,
    name: sub.display_name ?? '',
  });

  const horoscopeId = crypto.randomUUID();
  const token = await manageToken(env, sub.id);
  const manage = `${env.SITE_URL}/${sub.locale}/subscription?t=${token}`;
  const channels: string[] = [];

  if (sub.email) {
    const sent = await sendHoroscope(env, sub.email, sub.locale, {
      title: result.title,
      text: result.text,
      start: result.start,
      end: result.end,
      manage,
    });
    if (sent.status === 'sent') channels.push('email');
  }
  const chat = await telegramChatFor(env.DB, sub.id);
  if (chat !== null) {
    try {
      await env.BOT.sendHoroscope({ chatId: chat, locale: sub.locale, title: result.title, text: result.text });
      channels.push('telegram');
    } catch (error) {
      console.error('telegram horoscope', sub.id, errorCode(error));
    }
  }

  await env.DB.prepare(
    `INSERT INTO horoscopes (id, subscription_id, period, start_date, end_date, title, text,
       cost_micros, channels, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      horoscopeId,
      sub.id,
      result.period,
      result.start,
      result.end,
      result.title,
      result.text,
      result.cost_micros,
      channels.join(','),
      now(),
    )
    .run();
  await env.DB.prepare('UPDATE subscriptions SET next_send_at = ?, updated_at = ? WHERE id = ?')
    .bind(nextSendAfter(new Date(), sub.cadence, sub.send_hour_utc), now(), sub.id)
    .run();
}

/** The birth data behind a subscription, while the correction window is open. */
export async function subscriptionBirth(env: Env, sub: SubscriptionRow): Promise<BirthInput | null> {
  if (!sub.birth_ciphertext || !sub.birth_nonce) return null;
  return decryptJson<BirthInput>(sub.birth_ciphertext, sub.birth_nonce, env.DATA_KEY);
}

// ---- Telegram binding for a subscription -------------------------------------------------

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function randomCode(length: number): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && out.length < length) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

export async function telegramCodeForSubscription(db: D1Database, id: string): Promise<string> {
  const existing = await db
    .prepare('SELECT code FROM telegram_subscriptions WHERE subscription_id = ?')
    .bind(id)
    .first<{ code: string }>();
  if (existing) return existing.code;
  const code = randomCode(16);
  await db
    .prepare('INSERT INTO telegram_subscriptions (code, subscription_id, created_at) VALUES (?, ?, ?)')
    .bind(code, id, now())
    .run();
  return code;
}

export async function claimTelegramSubscription(
  db: D1Database,
  code: string,
  chatId: number,
): Promise<{ id: string; locale: string } | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.locale FROM telegram_subscriptions t JOIN subscriptions s ON s.id = t.subscription_id
       WHERE t.code = ?`,
    )
    .bind(code)
    .first<{ id: string; locale: string }>();
  if (!row) return null;
  await db.prepare('UPDATE telegram_subscriptions SET chat_id = ? WHERE code = ?').bind(chatId, code).run();
  return row;
}

export async function telegramChatFor(db: D1Database, id: string): Promise<number | null> {
  const row = await db
    .prepare('SELECT chat_id FROM telegram_subscriptions WHERE subscription_id = ? AND chat_id IS NOT NULL')
    .bind(id)
    .first<{ chat_id: number }>();
  return row?.chat_id ?? null;
}

export async function forgetTelegramSubscriptions(db: D1Database, chatId: number): Promise<void> {
  await db.prepare('UPDATE telegram_subscriptions SET chat_id = NULL WHERE chat_id = ?').bind(chatId).run();
}

/** The sweep: birth data past its window goes, the chart stays. */
export async function dropExpiredBirths(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE subscriptions SET birth_ciphertext = NULL, birth_nonce = NULL
       WHERE birth_expires_at IS NOT NULL AND birth_expires_at < ? AND birth_ciphertext IS NOT NULL`,
    )
    .bind(now())
    .run();
}
