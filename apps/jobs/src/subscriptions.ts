import { type Blobish, canonicalJson, decryptJson, encryptJson, hmacHex, readLink, signLink } from './crypto';
import { expiryFrom, now } from './db';
import type { Env } from './env';
import { errorCode, UpstreamError } from './errors';
import { sendHoroscope, sendSubscriptionConfirm, sendTrialEnded } from './mail';
import { apiFetch, clampName, ephemeris } from './pipeline';
import type { Birth, SubscriptionInput } from './validate';

/* The horoscope subscription: a chart kept on file, a cadence, and a channel or two.
 *
 * A subscription starts when its address is confirmed. Until then it is a pending row holding the
 * request, the birth data encrypted, and nothing more: no chart, no horoscope, nothing queued.
 * Confirming computes the chart and starts the free month; when the month is over the
 * subscription ends, with one letter. The birth data is kept, encrypted, for thirty days after the
 * start — the window in which a wrong birth time gets noticed — and then dropped by the sweep,
 * while the chart, encrypted as well, lives on with the subscription. */

export type Cadence = 'week' | 'month';
/** What the status column holds. */
export type StoredStatus = 'active' | 'paused' | 'cancelled';
/** What the site is told. Pending and ended live in columns of their own (migration 0016). */
export type SubscriptionStatus = 'pending' | StoredStatus | 'ended';

export interface SubscriptionRow {
  id: string;
  email: string | null;
  locale: string;
  gender: 'f' | 'm' | 'n';
  /** The name in the clear: only rows from before the chart was encrypted, until the sweep. */
  display_name: string | null;
  cadence: Cadence;
  /** The chart in the clear: only rows from before; an empty string otherwise. */
  chart_json: string;
  chart_ciphertext: Blobish | null;
  chart_nonce: Blobish | null;
  birth_ciphertext: Blobish | null;
  birth_nonce: Blobish | null;
  birth_expires_at: string | null;
  status: StoredStatus;
  next_send_at: string;
  send_hour_utc: number;
  trial_ends_at: string | null;
  confirmed_at: string | null;
  ended_at: string | null;
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

/** A subscription still waiting for its confirmation. A confirmed one has both dates; one the
 * worker before this made during its deploy has a trial date, and counts as confirmed. */
const PENDING = 'confirmed_at IS NULL AND trial_ends_at IS NULL';

export function subscriptionStatus(
  sub: Pick<SubscriptionRow, 'confirmed_at' | 'trial_ends_at' | 'ended_at' | 'status'>,
): SubscriptionStatus {
  if (sub.confirmed_at === null && sub.trial_ends_at === null) return 'pending';
  if (sub.ended_at) return 'ended';
  return sub.status;
}

/** How long a wrong birth time can still be corrected. */
const CORRECTION_DAYS = 30;
/** The free month. */
const TRIAL_DAYS = 30;
/** Management links outlive documents: a year, renewed by every letter that carries one. */
const MANAGE_TTL_SECONDS = 365 * 24 * 60 * 60;
/** How long a confirmation link works; an unconfirmed subscription is swept after as long. */
export const CONFIRM_DAYS = 7;
/** Subscriptions one address may have waiting or running at once. */
const PER_ADDRESS = 3;
/** Confirmation letters one address may be sent in a day. */
const LETTERS_PER_DAY = 3;

/** What a horoscope is written from: the chart's positions and houses, and the name it is
 * addressed to. Stored encrypted. */
interface StoredChart {
  positions: { body: string; longitude: number }[];
  houses: { cusps: { longitude: number }[] } | null;
  name: string;
}

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

/** The chart a horoscope is written from, whichever way the row holds it; null for a pending
 * subscription, which has none yet. */
export async function subscriptionChart(env: Env, sub: SubscriptionRow): Promise<StoredChart | null> {
  if (sub.chart_ciphertext && sub.chart_nonce) {
    return decryptJson<StoredChart>(sub.chart_ciphertext, sub.chart_nonce, env.DATA_KEY);
  }
  if (!sub.chart_json) return null;
  const chart = JSON.parse(sub.chart_json) as Omit<StoredChart, 'name'>;
  return { ...chart, name: sub.display_name ?? '' };
}

/** A request to subscribe. It stores a pending subscription (or finds the same request still
 * waiting) and sends the letter that confirms it — within limits: three subscriptions waiting or
 * running per address, three letters per address a day. Past either, nothing happens, and the
 * caller is never told which: the answer is the same for every request. */
export async function requestSubscription(env: Env, input: SubscriptionInput): Promise<void> {
  const id = (await waitingTwin(env, input)) ?? (await insertPending(env, input));
  if (!id || !(await letterAllowed(env, input.email))) return;
  const token = await signLink('subconfirm', { sub: id }, env.LINK_KEY, CONFIRM_DAYS * 86_400);
  const link = `${env.SITE_URL}/${input.locale}/subscription/confirm?t=${token}`;
  try {
    await sendSubscriptionConfirm(env, input.email, input.locale, link);
  } catch (error) {
    // Asking again sends another letter, within the day's three.
    console.error('confirmation letter', id, errorCode(error));
  }
}

/** The same request, still waiting for its confirmation: same address, birth, cadence and
 * language. A second request for it sends the letter again rather than storing a twin. */
async function waitingTwin(env: Env, input: SubscriptionInput): Promise<string | null> {
  const { results } = await env.DB.prepare(
    `SELECT id, locale, cadence, birth_ciphertext, birth_nonce FROM subscriptions WHERE email = ? AND ${PENDING}`,
  )
    .bind(input.email)
    .all<{ id: string; locale: string; cadence: string; birth_ciphertext: Blobish | null; birth_nonce: Blobish | null }>();
  for (const row of results) {
    if (row.locale !== input.locale || row.cadence !== input.cadence) continue;
    if (!row.birth_ciphertext || !row.birth_nonce) continue;
    const birth = await decryptJson<Birth>(row.birth_ciphertext, row.birth_nonce, env.DATA_KEY);
    if (canonicalJson(birth) === canonicalJson(input.birth)) return row.id;
  }
  return null;
}

/** Stores a pending subscription unless the address already has three waiting or running. The
 * count and the insert are one statement: two requests at once cannot both slip past it. */
async function insertPending(env: Env, input: SubscriptionInput): Promise<string | null> {
  const { ciphertext, nonce } = await encryptJson(input.birth, env.DATA_KEY);
  const id = crypto.randomUUID();
  const ts = now();
  const result = await env.DB.prepare(
    `INSERT INTO subscriptions (id, email, locale, gender, cadence, chart_json, birth_ciphertext,
       birth_nonce, birth_expires_at, status, next_send_at, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, '', ?, ?, ?, 'paused', ?, ?, ?
     WHERE (SELECT COUNT(*) FROM subscriptions
            WHERE email = ? AND ((${PENDING}) OR (status = 'active' AND ended_at IS NULL))) < ?`,
  )
    .bind(
      id,
      input.email,
      input.locale,
      input.birth.gender,
      input.cadence,
      ciphertext,
      nonce,
      expiryFrom(CORRECTION_DAYS),
      ts,
      ts,
      ts,
      input.email,
      PER_ADDRESS,
    )
    .run();
  return (result.meta.changes ?? 0) > 0 ? id : null;
}

/** Books one confirmation letter for an address if it has had fewer than three today. The address
 * is kept as a keyed hash; the count and the booking are one statement. */
async function letterAllowed(env: Env, email: string): Promise<boolean> {
  const hash = await hmacHex(env.LINK_KEY, `subconfirm:${email}`);
  const result = await env.DB.prepare(
    `INSERT INTO mail_log (id, kind, email_hash, created_at)
     SELECT ?, 'subconfirm', ?, ?
     WHERE (SELECT COUNT(*) FROM mail_log WHERE kind = 'subconfirm' AND email_hash = ? AND created_at > ?) < ?`,
  )
    .bind(crypto.randomUUID(), hash, now(), hash, expiryFrom(-1), LETTERS_PER_DAY)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Starts a pending subscription: computes its chart, starts the free month and queues the first
 * horoscope, once however often the link is used. Returns the management link's token, also for a
 * subscription confirmed before; null when the link is not valid. */
export async function confirmSubscription(env: Env, token: string): Promise<string | null> {
  const claims = await readLink('subconfirm', token, env.LINK_KEY);
  if (!claims) return null;
  const sub = await getSubscription(env.DB, claims.sub);
  if (!sub) return null;
  if (subscriptionStatus(sub) === 'pending') {
    const birth = await subscriptionBirth(env, sub);
    if (!birth) return null;
    const facts = await ephemeris<{ positions: StoredChart['positions']; houses?: StoredChart['houses'] }>(
      env,
      '/v1/calc',
      { date: birth.date, time: birth.time, latitude: birth.latitude, longitude: birth.longitude, zone: birth.zone },
    );
    const chart: StoredChart = { positions: facts.positions, houses: facts.houses ?? null, name: birth.name };
    const sealed = await encryptJson(chart, env.DATA_KEY);
    const ts = now();
    const started = await env.DB.prepare(
      `UPDATE subscriptions SET status = 'active', confirmed_at = ?, trial_ends_at = ?, next_send_at = ?,
              birth_expires_at = ?, chart_ciphertext = ?, chart_nonce = ?, chart_json = '', updated_at = ?
       WHERE id = ? AND ${PENDING}`,
    )
      .bind(ts, expiryFrom(TRIAL_DAYS), ts, expiryFrom(CORRECTION_DAYS), sealed.ciphertext, sealed.nonce, ts, sub.id)
      .run();
    // The first horoscope goes out at once: a subscription that says "see you next week" gives
    // nothing to judge it by.
    if (started.meta.changes) await env.JOBS.send({ subscriptionId: sub.id });
  }
  return manageToken(env, sub.id);
}

export async function updateSubscription(
  db: D1Database,
  id: string,
  patch: { cadence?: Cadence; status?: StoredStatus; email?: string | null },
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

/** Subscriptions whose next horoscope is due; pending and ended ones are stored as paused and
 * never are. */
export async function dueSubscriptions(db: D1Database): Promise<{ id: string; trial_ends_at: string | null }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, trial_ends_at FROM subscriptions
       WHERE status = 'active' AND ended_at IS NULL AND next_send_at <= ? LIMIT 200`,
    )
    .bind(now())
    .all<{ id: string; trial_ends_at: string | null }>();
  return results;
}

/** The free month is over: the subscription stops, with one letter that says so (no payment
 * link: there is no paid plan yet). Returns whether this call was the one that ended it. */
export async function endTrial(env: Env, id: string): Promise<boolean> {
  const ts = now();
  const ended = await env.DB.prepare(
    `UPDATE subscriptions SET status = 'paused', ended_at = ?, updated_at = ?
     WHERE id = ? AND status = 'active' AND ended_at IS NULL
     RETURNING email, locale`,
  )
    .bind(ts, ts, id)
    .first<{ email: string | null; locale: string }>();
  if (!ended) return false;
  if (ended.email) {
    try {
      const manage = `${env.SITE_URL}/${ended.locale}/subscription?t=${await manageToken(env, id)}`;
      await sendTrialEnded(env, ended.email, ended.locale, manage);
    } catch (error) {
      console.error('trial letter', id, errorCode(error));
    }
  }
  return true;
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

/** Writes the horoscope that is due and sends it wherever the subscription points. A subscription
 * whose free month is over is ended instead. */
export async function deliverHoroscope(env: Env, id: string): Promise<void> {
  const sub = await getSubscription(env.DB, id);
  if (!sub || subscriptionStatus(sub) !== 'active') return;
  if (sub.trial_ends_at && sub.trial_ends_at <= now()) {
    await endTrial(env, sub.id);
    return;
  }
  // The queue may hand the same subscription over twice; only one horoscope per window.
  const latest = await latestHoroscope(env.DB, id);
  const today = now().slice(0, 10);
  if (latest && latest.start_date === today && latest.period === sub.cadence) {
    await updateSubscription(env.DB, id, {});
    return;
  }

  const chart = await subscriptionChart(env, sub);
  if (!chart) return;
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
    facts: { positions: chart.positions, houses: chart.houses },
    transits: transits.events,
    sky: sky.positions,
    period: sub.cadence,
    start: today,
    end: endDate,
    lang: sub.locale,
    gender: sub.gender,
    name: clampName(chart.name),
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
export async function subscriptionBirth(env: Env, sub: SubscriptionRow): Promise<Birth | null> {
  if (!sub.birth_ciphertext || !sub.birth_nonce) return null;
  return decryptJson<Birth>(sub.birth_ciphertext, sub.birth_nonce, env.DATA_KEY);
}

/** Encrypts up to `limit` charts still stored in the clear, the name moving into the ciphertext
 * with them, and marks the subscriptions the worker before this one made during its deploy as
 * confirmed. Part of the nightly sweep. */
export async function sealLegacyCharts(env: Env, limit: number): Promise<number> {
  await env.DB.prepare(
    'UPDATE subscriptions SET confirmed_at = created_at WHERE confirmed_at IS NULL AND trial_ends_at IS NOT NULL',
  ).run();
  const { results } = await env.DB.prepare(
    "SELECT id, chart_json, display_name FROM subscriptions WHERE chart_ciphertext IS NULL AND chart_json != '' LIMIT ?",
  )
    .bind(limit)
    .all<{ id: string; chart_json: string; display_name: string | null }>();
  let sealed = 0;
  for (const row of results) {
    let chart: Omit<StoredChart, 'name'>;
    try {
      chart = JSON.parse(row.chart_json) as Omit<StoredChart, 'name'>;
    } catch {
      console.error('unreadable chart left as it is', row.id);
      continue;
    }
    const { ciphertext, nonce } = await encryptJson({ ...chart, name: row.display_name ?? '' }, env.DATA_KEY);
    const result = await env.DB.prepare(
      `UPDATE subscriptions SET chart_ciphertext = ?, chart_nonce = ?, chart_json = '', display_name = NULL
       WHERE id = ? AND chart_json = ?`,
    )
      .bind(ciphertext, nonce, row.id, row.chart_json)
      .run();
    sealed += result.meta.changes ?? 0;
  }
  return sealed;
}

/** The sweep's part for subscriptions: an unconfirmed request goes after a week, a cancelled or
 * ended subscription thirty days after it stopped, its horoscopes and Telegram binding with it. */
export async function sweepSubscriptions(db: D1Database): Promise<number> {
  const week = expiryFrom(-CONFIRM_DAYS);
  const month = expiryFrom(-30);
  const [pending, stopped] = await db.batch([
    db.prepare(`DELETE FROM subscriptions WHERE ${PENDING} AND created_at < ?`).bind(week),
    db
      .prepare(
        `DELETE FROM subscriptions
         WHERE (status = 'cancelled' AND updated_at < ?) OR (ended_at IS NOT NULL AND ended_at < ?)`,
      )
      .bind(month, month),
  ]);
  return (pending?.meta.changes ?? 0) + (stopped?.meta.changes ?? 0);
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

/** Binds a subscription's code to the chat that opened it first, like a document's: a code bound
 * to another chat stays with it until that chat says /stop. */
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
  const bound = await db
    .prepare('UPDATE telegram_subscriptions SET chat_id = ? WHERE code = ? AND (chat_id IS NULL OR chat_id = ?)')
    .bind(chatId, code, chatId)
    .run();
  return (bound.meta.changes ?? 0) > 0 ? row : null;
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
