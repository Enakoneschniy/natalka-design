import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';

/** Our own counters.
 *
 * One row per day per combination in D1, written from the server that rendered the page. No
 * cookie is set for this, nothing is sent to anyone else, and no row points at a person — which
 * is why it needs no banner and no consent. It is also the only thing that can settle the price
 * experiment: what the browser reports can be blocked, and what a third party reports is not
 * ours to keep.
 *
 * Never on the critical path: the write runs after the response has been sent, and a failure is
 * a lost count, not a lost page.
 */

export type StatEvent = 'landing' | 'start' | 'preview' | 'paywall' | 'checkout';

/** Crawlers would otherwise be most of the top of the funnel. */
const LOOKS_AUTOMATED = /bot|crawl|spider|slurp|headless|preview|fetch|monitor|curl|python/i;

export async function count(
  event: StatEvent,
  extra: { variant?: string | null; angle?: string | null } = {},
): Promise<void> {
  try {
    const list = await headers();
    if (LOOKS_AUTOMATED.test(list.get('user-agent') ?? '')) return;
    const { env, ctx } = getCloudflareContext();
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return;
    const country = (list.get('cf-ipcountry') ?? '').toUpperCase();
    const day = new Date().toISOString().slice(0, 10);
    const write = db
      .prepare(
        `INSERT INTO stats (day, event, variant, angle, country, currency, count, amount_minor)
         VALUES (?, ?, ?, ?, ?, '', 1, 0)
         ON CONFLICT (day, event, variant, angle, country, currency)
         DO UPDATE SET count = count + 1`,
      )
      .bind(day, event, extra.variant ?? '', extra.angle ?? '', country)
      .run();
    ctx.waitUntil(write);
  } catch {
    // A counter is never a reason for a page to fail.
  }
}
