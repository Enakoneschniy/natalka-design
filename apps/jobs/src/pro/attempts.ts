/** Tries the cabinet allows a few of per hour (pro_attempts): an invite code that did not work, by
 * account, and a PDF assembly, by reading. A try takes its place before the work it stands for and
 * gives it back when it should not count; the nightly sweep removes rows older than a day. */

import { now } from '../db';

export type AttemptKind = 'invite' | 'pdf';

/** Takes a place for one more try of `kind` against `subject`, or returns null when the last hour
 * already holds `perHour` of them. The count and the insert are one statement, so tries sent at
 * once cannot pass the limit together. The place's id gives it back. */
export async function takeAttempt(
  db: D1Database,
  kind: AttemptKind,
  subject: string,
  perHour: number,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const placed = await db
    .prepare(
      `INSERT INTO pro_attempts (id, kind, subject, created_at)
       SELECT ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM pro_attempts WHERE kind = ? AND subject = ? AND created_at > ?) < ?`,
    )
    .bind(id, kind, subject, now(), kind, subject, hourAgo, perHour)
    .run();
  return placed.meta.changes ? id : null;
}

/** Gives a place back: the try did not count after all. */
export async function giveAttemptBack(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM pro_attempts WHERE id = ?').bind(id).run();
}
