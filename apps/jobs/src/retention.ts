/** The nightly sweep: what the privacy policy promises to delete, deleted.
 *
 * Birth data, documents and the texts written from them go thirty days after the order; an
 * unpaid order goes after a week; a paid order keeps its row for accounting, and its address for
 * half a year. Each step runs on its own: one that fails is logged and the others still run.
 * Rows go first and stored objects after, best effort — an object nobody points at any more is
 * harmless, a row pointing at a deleted object is not. */

import { expiryFrom, now, scrubExpiredJobPayloads, TELEGRAM_LINK_DAYS } from './db';
import type { Env } from './env';
import { errorCode } from './errors';
import { sealLegacyPayloads } from './pipeline';
import { KNOWN_REQUESTER_DAYS } from './pro/auth';
import { UNKNOWN_REQUESTER } from './pro/requester';
import { dropExpiredBirths, sealLegacyCharts, sweepSubscriptions } from './subscriptions';

/** How long an unpaid order is kept after its last payment page was opened. */
const UNPAID_DAYS = 7;
/** How long a paid order keeps the address it was paid from. */
const ADDRESS_DAYS = 180;
/** Rows touched per statement, and the most statements a step runs in one night. */
const BATCH = 500;
const ROUNDS = 40;
/** Stored payloads and charts encrypted per night. */
const SEAL_PER_NIGHT = 200;

export interface SweepOptions {
  /** Rows per statement; small in tests to exercise the loops. */
  batch?: number;
}

/** Runs every step and returns what each removed, or 'failed'. */
export async function sweep(env: Env, options: SweepOptions = {}): Promise<Record<string, number | 'failed'>> {
  const batch = options.batch ?? BATCH;
  const days = Number(env.RETENTION_DAYS ?? '30');
  const steps: [string, () => Promise<number>][] = [
    ['subscription births', async () => (await dropExpiredBirths(env.DB), 0)],
    ['subscriptions', () => sweepSubscriptions(env.DB)],
    ['job payloads', () => scrubExpiredJobPayloads(env.DB, days)],
    ['documents', () => expiredDocuments(env, batch)],
    ['charts', () => run(env, 'DELETE FROM charts WHERE expires_at < ?', now())],
    ['chart labels', () => run(env, 'UPDATE charts SET display_name = NULL, place_label = NULL WHERE display_name IS NOT NULL OR place_label IS NOT NULL')],
    ['previews', () => run(env, 'DELETE FROM previews WHERE expires_at < ?', now())],
    ['unpaid orders', () => unpaidOrders(env, batch)],
    ['order addresses', () => orderAddresses(env)],
    ['telegram links', () => run(env, 'DELETE FROM telegram_links WHERE created_at < ?', expiryFrom(-TELEGRAM_LINK_DAYS))],
    ['job errors', () => run(env, 'UPDATE jobs SET last_error = NULL WHERE last_error IS NOT NULL AND updated_at < ?', expiryFrom(-days))],
    ['sign-in links', () => signInLinks(env)],
    // The cabinet's hourly limits look back an hour; a day of history is more than they need.
    ['cabinet attempts', () => run(env, 'DELETE FROM pro_attempts WHERE created_at < ?', expiryFrom(-1))],
    ['stripe tombstones', () => stripeTombstones(env)],
    ['letter log', () => run(env, 'DELETE FROM mail_log WHERE created_at < ?', expiryFrom(-2))],
    // Last: encrypting old rows is the heaviest work of the night, and if the invocation dies in
    // it, every deletion above has already run.
    ['plain payloads encrypted', () => sealLegacyPayloads(env, SEAL_PER_NIGHT)],
    ['plain charts encrypted', () => sealLegacyCharts(env, SEAL_PER_NIGHT)],
  ];
  const report: Record<string, number | 'failed'> = {};
  for (const [name, step] of steps) {
    try {
      report[name] = await step();
    } catch (error) {
      report[name] = 'failed';
      console.error('retention step failed', name, errorCode(error));
    }
  }
  console.log('retention', JSON.stringify(report));
  return report;
}

async function run(env: Env, sql: string, ...values: unknown[]): Promise<number> {
  const result = await env.DB.prepare(sql).bind(...values).run();
  return result.meta.changes ?? 0;
}

/** Repeats a statement that touches at most `batch` rows until it touches fewer, or the night's
 * rounds are spent; the rest waits for tomorrow. */
async function inBatches(batch: number, once: () => Promise<number>): Promise<number> {
  let total = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const touched = await once();
    total += touched;
    if (touched < batch) break;
  }
  return total;
}

/** Deletes stored objects a thousand keys at a time (R2's limit), each batch on its own. */
async function deleteObjects(env: Env, keys: string[]): Promise<void> {
  for (let at = 0; at < keys.length; at += 1000) {
    try {
      await env.DOCS.delete(keys.slice(at, at + 1000));
    } catch (error) {
      console.error('retention: objects left in storage', keys.length, errorCode(error));
    }
  }
}

/** Documents past their date: the rows, then the PDFs. */
async function expiredDocuments(env: Env, batch: number): Promise<number> {
  return inBatches(batch, async () => {
    const { results } = await env.DB.prepare(
      `DELETE FROM documents WHERE id IN (SELECT id FROM documents WHERE expires_at < ? LIMIT ?)
       RETURNING storage_key`,
    )
      .bind(now(), batch)
      .all<{ storage_key: string }>();
    await deleteObjects(env, results.map((row) => row.storage_key));
    return results.length;
  });
}

/** A shopper's order never paid for goes a week after its last payment page was opened, with
 * everything that hangs off it. One held for a payment of the wrong amount stays: money was taken,
 * and the order is what the refund is made against. */
async function unpaidOrders(env: Env, batch: number): Promise<number> {
  const unpaid = `SELECT id FROM orders
    WHERE pro_account_id IS NULL AND status = 'pending' AND hold IS NULL
      AND COALESCE(checkout_at, created_at) < ?`;
  const cutoff = expiryFrom(-UNPAID_DAYS);
  // An unpaid order has no document; any there is goes first all the same.
  const { results } = await env.DB.prepare(
    `DELETE FROM documents WHERE order_id IN (${unpaid}) RETURNING storage_key`,
  )
    .bind(cutoff)
    .all<{ storage_key: string }>();
  const removed = await inBatches(batch, () =>
    run(env, `DELETE FROM orders WHERE id IN (${unpaid} LIMIT ?)`, cutoff, batch),
  );
  await deleteObjects(env, results.map((row) => row.storage_key));
  return removed;
}

/** Sign-in links are worth nothing a day after they expire, and the hour of history the limits
 * look back is long past by then: they go, but for one that was opened at a known requester's
 * request, which says where the address's owner signs in and is kept for as long as that spares
 * the requester the address's limit (KNOWN_REQUESTER_DAYS) — without what was typed at sign-up. */
async function signInLinks(env: Env): Promise<number> {
  const expired = expiryFrom(-1);
  const [, removed] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE pro_login_tokens SET signup_name = NULL, signup_invite = NULL
       WHERE expires_at < ? AND (signup_name IS NOT NULL OR signup_invite IS NOT NULL)`,
    ).bind(expired),
    env.DB.prepare(
      `DELETE FROM pro_login_tokens
       WHERE expires_at < ? AND (used_at IS NULL OR used_at < ? OR requester IS NULL OR requester = ?)`,
    ).bind(expired, expiryFrom(-KNOWN_REQUESTER_DAYS), UNKNOWN_REQUESTER),
  ]);
  return removed?.meta.changes ?? 0;
}

/** A refund or dispute Stripe reported goes after a month, by when any completion it overtook has
 * long arrived — except the disputes of a payment whose shopper's order they hold: the list is what
 * lets the order go once each is won, and a dispute can stay open for months. Payment ids only. */
function stripeTombstones(env: Env): Promise<number> {
  return run(
    env,
    `DELETE FROM stripe_tombstones WHERE created_at < ?
       AND NOT (kind = 'dispute' AND EXISTS (
         SELECT 1 FROM orders o
         WHERE o.stripe_payment_intent = stripe_tombstones.payment_intent AND o.pro_account_id IS NULL
           AND o.hold = 'disputed'))`,
    expiryFrom(-30),
  );
}

/** A shopper's address is kept with a paid order for half a year (questions, refunds), then
 * erased; so is the address of an order held for a payment of the wrong amount, which is kept
 * for its refund. The column cannot be NULL, so it becomes an empty string, which no letter is
 * sent to. */
function orderAddresses(env: Env): Promise<number> {
  return run(
    env,
    `UPDATE orders SET email = ''
     WHERE pro_account_id IS NULL AND email != '' AND created_at < ?
       AND (status IN ('paid', 'refunded', 'test') OR (status = 'pending' AND hold = 'amount_mismatch'))`,
    expiryFrom(-ADDRESS_DAYS),
  );
}
