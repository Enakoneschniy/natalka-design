/** The advertising tags, and the rule for when they may run.
 *
 * Three platforms, one switch each: nothing loads unless its id is set in the worker's
 * environment, nothing loads at all until the visitor has said yes, and nothing loads on a page
 * that carries anything about them. All of it is decided on the server, so a tag that must not run
 * is not in the page to begin with.
 */

export interface Tags {
  meta?: string;
  ga?: string;
  ads?: string;
  tiktok?: string;
}

export const tags = (): Tags => ({
  meta: process.env.META_PIXEL_ID || undefined,
  ga: process.env.GA_MEASUREMENT_ID || undefined,
  ads: process.env.GOOGLE_ADS_ID || undefined,
  tiktok: process.env.TIKTOK_PIXEL_ID || undefined,
});

export const anyTag = (t: Tags = tags()): boolean => Boolean(t.meta || t.ga || t.ads || t.tiktok);

/** Their answer, kept in a first-party cookie for a year. Absent means not asked yet. */
export const CONSENT_COOKIE = 'chr_consent';
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

export type Consent = 'granted' | 'denied';

export const readConsent = (value: string | undefined): Consent | null =>
  value === 'granted' || value === 'denied' ? value : null;

/** The campaign that brought them, kept for the visit and no longer.
 *
 * A label like "meta" or "tiktok_spring", never an identifier: it says which advert worked, not
 * who clicked it. It is a session cookie on purpose — attribution has to survive the walk from
 * the landing to the payment page, which takes minutes, and nothing after that. */
export const SOURCE_COOKIE = 'chr_src';

/** Whatever arrives in utm_source, reduced to something safe to store and print. */
export const cleanSource = (value: string | null | undefined): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24);

/** The source cookie as it is read back: cleaned again, since a cookie is whatever the browser
 * sends; null when nothing usable is left. */
export const readSource = (value: string | null | undefined): string | null =>
  cleanSource(value) || null;
