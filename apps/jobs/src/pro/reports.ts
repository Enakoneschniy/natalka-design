/** A seller flags a section of a reading as wrong. Kept for the owner to read. */

import { now } from '../db';
import type { Env } from '../env';

export const MAX_COMMENT = 1000;
export const REPORTS_PER_HOUR = 20;

export type ReportResult = 'ok' | 'comment' | 'too_many';

/** Stores a report, unless the seller has filed REPORTS_PER_HOUR in the last hour: the count and
 * the insert are one statement, so reports sent at once cannot pass the limit together. The
 * comment may hold client data: it is stored, never logged. */
export async function fileReport(
  env: Env,
  accountId: string,
  orderId: string,
  sectionId: string,
  rawComment: unknown,
): Promise<ReportResult> {
  const comment = typeof rawComment === 'string' ? rawComment.trim() : '';
  if (comment.length < 1 || comment.length > MAX_COMMENT) return 'comment';
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const stored = await env.DB.prepare(
    `INSERT INTO pro_reports (id, account_id, order_id, section_id, comment, created_at)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM pro_reports WHERE account_id = ? AND created_at > ?) < ?`,
  )
    .bind(crypto.randomUUID(), accountId, orderId, sectionId, comment, now(), accountId, since, REPORTS_PER_HOUR)
    .run();
  if (!stored.meta.changes) return 'too_many';
  console.warn('pro report', { account: accountId, order: orderId, section: sectionId });
  return 'ok';
}
