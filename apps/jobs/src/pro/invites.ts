/** Invite codes: how the marketer's sellers get their trial credits.
 *
 * Redeeming is one D1 batch, and a batch is one transaction:
 * 1. record the redemption, but only from a code that is live and not used up;
 * 2. count the use;
 * 3. book the credits.
 * Steps 2 and 3 read the row step 1 wrote, matched by account and this batch's timestamp, so if
 * step 1 finds no live code, nothing happens. The redemption's primary key is the account: a
 * second redemption by the same seller, even a racing one, fails the whole batch.
 *
 * A seller has FAILED_INVITES_PER_HOUR codes that do not work an hour; past that every try is
 * refused before its code is looked at.
 */

import { now } from '../db';
import { giveAttemptBack, takeAttempt } from './attempts';

export const FAILED_INVITES_PER_HOUR = 5;

export type InviteResult =
  | { status: 'granted'; credits: number }
  | { status: 'invalid' }
  | { status: 'already' }
  | { status: 'too_many' };

export async function hasRedeemed(db: D1Database, accountId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS yes FROM pro_invite_redemptions WHERE account_id = ?')
    .bind(accountId)
    .first<{ yes: number }>();
  return Boolean(row);
}

export async function redeemInvite(
  db: D1Database,
  accountId: string,
  rawCode: unknown,
): Promise<InviteResult> {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!code) return { status: 'invalid' };
  if (await hasRedeemed(db, accountId)) return { status: 'already' };

  // The try takes a place among the hour's failures before the code is looked at, and gives it
  // back unless the code turns out not to work.
  const attempt = await takeAttempt(db, 'invite', accountId, FAILED_INVITES_PER_HOUR);
  if (!attempt) return { status: 'too_many' };
  let result: InviteResult | undefined;
  try {
    result = await redeem(db, accountId, code);
    return result;
  } finally {
    if (result?.status !== 'invalid') await giveAttemptBack(db, attempt);
  }
}

async function redeem(db: D1Database, accountId: string, code: string): Promise<InviteResult> {
  const ts = now();
  let inserted: D1Result | undefined;
  try {
    [inserted] = await db.batch([
      db
        .prepare(
          `INSERT INTO pro_invite_redemptions (account_id, code, credits, created_at)
           SELECT ?, code, credits, ? FROM pro_invite_codes
           WHERE code = ? AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .bind(accountId, ts, code, ts),
      db
        .prepare(
          `UPDATE pro_invite_codes SET uses = uses + 1
           WHERE code IN (SELECT code FROM pro_invite_redemptions WHERE account_id = ? AND created_at = ?)`,
        )
        .bind(accountId, ts),
      db
        .prepare(
          `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
           SELECT ?, account_id, credits, 'trial', 'invite:' || account_id, ?
           FROM pro_invite_redemptions WHERE account_id = ? AND created_at = ?`,
        )
        .bind(crypto.randomUUID(), ts, accountId, ts),
    ]);
  } catch (error) {
    // The same seller redeeming twice at once: the second batch hits the primary key and rolls back.
    if (String(error).includes('UNIQUE')) return { status: 'already' };
    throw error;
  }
  if (!inserted?.meta.changes) return { status: 'invalid' };

  const row = await db
    .prepare('SELECT credits FROM pro_invite_redemptions WHERE account_id = ?')
    .bind(accountId)
    .first<{ credits: number }>();
  return { status: 'granted', credits: row?.credits ?? 0 };
}
