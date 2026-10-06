/** A seller closes their cabinet, and what the offer promises to delete is deleted.
 *
 * Gone: every client and every reading (orders, charts, jobs with their texts, documents, reports,
 * and the PDFs in storage), the brand and its pictures, the address's sign-in links, the account's
 * limit counters. Kept, for accounting: the credit ledger, the purchases and the invite redemption,
 * which point at the account row. That row stays with its address replaced by
 * closed-<id>@invalid (which no form accepts), its name removed, its sessions ended and closed_at
 * set: it can never be signed in to again, and the same address can register anew.
 */

import { now } from '../db';
import type { Env } from '../env';
import type { ProAccount } from './auth';
import { brandFolder, dropFilesThenRows, readingFolder } from './storage';

export async function closeAccount(env: Env, account: ProAccount): Promise<void> {
  const { results } = await env.DB.prepare('SELECT id FROM orders WHERE pro_account_id = ?')
    .bind(account.id)
    .all<{ id: string }>();
  await dropFilesThenRows(
    env,
    [...results.map((order) => readingFolder(order.id)), brandFolder(account.id)],
    [
      env.DB.prepare(
        "DELETE FROM pro_attempts WHERE kind = 'pdf' AND subject IN (SELECT id FROM orders WHERE pro_account_id = ?)",
      ).bind(account.id),
      // The readings before the clients: they point at them.
      env.DB.prepare('DELETE FROM orders WHERE pro_account_id = ?').bind(account.id),
      env.DB.prepare('DELETE FROM pro_clients WHERE account_id = ?').bind(account.id),
      env.DB.prepare('DELETE FROM pro_brands WHERE account_id = ?').bind(account.id),
      env.DB.prepare('DELETE FROM pro_login_tokens WHERE email = ?').bind(account.email),
      env.DB.prepare("DELETE FROM pro_attempts WHERE kind = 'invite' AND subject = ?").bind(account.id),
      env.DB.prepare(
        `UPDATE pro_accounts SET email = 'closed-' || id || '@invalid', name = NULL, closed_at = ?,
                                 session_epoch = session_epoch + 1
         WHERE id = ? AND closed_at IS NULL`,
      ).bind(now(), account.id),
    ],
  );
}
