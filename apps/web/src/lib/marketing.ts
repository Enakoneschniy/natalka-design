/** The advertising tags, and the rule for when they may run.
 *
 * Three platforms, one switch each: nothing loads unless its id is set in the worker's
 * environment, and nothing loads at all until the visitor has said yes. Both conditions are
 * checked on the server, so a tag that must not run is not in the page to begin with.
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
