/** Promo codes.
 *
 * A code is given out somewhere — a video, a newsletter — and lowers the price of the reading by
 * a percentage for as long as it runs. Codes are kept here, in the code, rather than in the
 * database: there are few of them, each one is added on the owner's word, and a code that is
 * part of a release is a code that was reviewed. The repository is public, and so is a code read
 * out in a video; a code meant for one person does not belong here.
 *
 * A visitor gets a code in two ways: in the link (`?code=…`), which the middleware keeps in a
 * cookie, or typed into the order screen. Either way the price is worked out on the server from
 * this table, and the cookie only names the code: editing it buys nothing a visitor could not
 * have typed.
 */

export interface PromoCode {
  /** As people type it, upper case: letters and digits. */
  code: string;
  /** Percent off the reading. */
  percent: number;
  /** The first moment it applies. */
  starts: Date;
  /** The first moment it no longer applies. */
  ends: Date;
  /** Where it was given out; for us, not for the page. */
  note: string;
}

/** Add a code here on the owner's word, with the dates it runs and where it was given out. */
const CODES: readonly PromoCode[] = [];

export const PROMO_COOKIE = 'chr_promo';

/** At most what the order record keeps as its price variant. */
const CODE = /^[A-Z0-9]{3,16}$/;

/** What a visitor typed, the way codes are written: no spaces, upper case. Null when it cannot be
 * a code at all. */
export function cleanCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.replace(/\s+/g, '').toUpperCase();
  return CODE.test(code) ? code : null;
}

export type PromoLookup =
  | { ok: true; promo: PromoCode }
  | { ok: false; reason: 'unknown' | 'early' | 'expired' };

/** The code as of `now`, or why it does not apply. */
export function lookupPromo(
  value: unknown,
  now: Date = new Date(),
  codes: readonly PromoCode[] = CODES,
): PromoLookup {
  const code = cleanCode(value);
  const promo = code ? codes.find((candidate) => candidate.code === code) : undefined;
  if (!promo) return { ok: false, reason: 'unknown' };
  if (now < promo.starts) return { ok: false, reason: 'early' };
  if (now >= promo.ends) return { ok: false, reason: 'expired' };
  return { ok: true, promo };
}

/** The code a visitor carries, if it still applies; anything else is as good as none. */
export function activePromo(
  value: unknown,
  now: Date = new Date(),
  codes: readonly PromoCode[] = CODES,
): PromoCode | null {
  const found = lookupPromo(value, now, codes);
  return found.ok ? found.promo : null;
}

/** How long the cookie keeps a code: until it ends, and no longer than two months. */
export function promoMaxAge(promo: PromoCode, now: Date = new Date()): number {
  const left = Math.floor((promo.ends.getTime() - now.getTime()) / 1000);
  return Math.max(0, Math.min(left, 60 * 60 * 24 * 60));
}
