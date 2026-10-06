/** What the site sends, checked before any of it is stored, charged or forwarded.
 *
 * The site's server checks the same limits; this copy is the one that counts, because it stands
 * in front of the database, Stripe and the text API. A refusal names the first field that failed
 * and nothing else. */

import type { Product } from './db';

export const PRODUCTS: readonly Product[] = ['natal', 'forecast', 'synastry', 'child', 'bundle'];
export const LOCALES = ['ru', 'uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export class InvalidField extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
    this.name = 'InvalidField';
  }
}

export const isProduct = (value: unknown): value is Product =>
  typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value);

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** Line breaks become spaces; every other control character, and the marks that reverse the
 * direction of text, are removed. None of them belongs in a name or a place printed on a cover,
 * in a file name or in a prompt. */
const BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
const CONTROL = /[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/** A line of text as it may be printed: breaks folded, controls out, runs of space collapsed. */
export const cleanLine = (value: string): string =>
  value.replace(BREAKS, ' ').replace(CONTROL, '').replace(/\s+/g, ' ').trim();

/** Length the way the text API counts it: in characters, not UTF-16 units. */
const length = (value: string): number => [...value].length;

function line(value: unknown, field: string, max: number, min = 0): string {
  if (typeof value !== 'string') throw new InvalidField(field);
  const cleaned = cleanLine(value);
  if (length(cleaned) < min || length(cleaned) > max) throw new InvalidField(field);
  return cleaned;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** An address, trimmed and lower-cased. */
export function parseEmail(value: unknown, field = 'email'): string {
  if (typeof value !== 'string') throw new InvalidField(field);
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new InvalidField(field);
  return email;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EARLIEST_BIRTH = '1900-01-01';

/** A real calendar date from 1900 up to today (UTC). Both sides are zero-padded ISO, so they
 * compare as strings. */
function birthDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new InvalidField(field);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InvalidField(field);
  if (value < EARLIEST_BIRTH || value > new Date().toISOString().slice(0, 10)) throw new InvalidField(field);
  return value;
}

function coordinate(value: unknown, field: string, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) throw new InvalidField(field);
  return value;
}

export interface Birth {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  name: string;
  gender: 'f' | 'm' | 'n';
}

/** One person's birth. The time is null when unknown — said explicitly, never by leaving it out.
 * `nameRequired`: the text API writes a reading around a name and refuses an empty one. */
export function parseBirth(raw: unknown, field: string, { nameRequired = false } = {}): Birth {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidField(field);
  const b = raw as Record<string, unknown>;
  const time = b.time === null ? null : typeof b.time === 'string' && TIME.test(b.time) ? b.time : undefined;
  if (time === undefined) throw new InvalidField(`${field}.time`);
  const gender = b.gender === 'f' || b.gender === 'm' || b.gender === 'n' ? b.gender : null;
  if (!gender) throw new InvalidField(`${field}.gender`);
  return {
    date: birthDate(b.date, `${field}.date`),
    time,
    latitude: coordinate(b.latitude, `${field}.latitude`, 90),
    longitude: coordinate(b.longitude, `${field}.longitude`, 180),
    zone: line(b.zone, `${field}.zone`, 64, 1),
    place: line(b.place ?? '', `${field}.place`, 120),
    name: line(b.name ?? '', `${field}.name`, 80, nameRequired ? 1 : 0),
    gender,
  };
}

export interface OrderInput {
  email: string;
  product: Product;
  locale: Locale;
  country: string | null;
  amount_minor: number;
  currency: string;
  variant: string | null;
  consent: 'granted' | 'denied' | null;
  source: string | null;
  birth: Birth;
  /** The partner; only a synastry has one, and anything else ignores it. */
  birth_second: Birth | null;
}

/** An order as the site sends it. `cancel_url` and `product_name` are ignored: the worker builds
 * both itself. The few fields that only label the order are kept when they look like what the site
 * sends and dropped otherwise; they never refuse an order. */
export function parseOrder(body: Record<string, unknown>): OrderInput {
  const email = parseEmail(body.email);
  if (!isProduct(body.product)) throw new InvalidField('product');
  const product = body.product;
  if (!isLocale(body.locale)) throw new InvalidField('locale');
  if (typeof body.currency !== 'string' || !/^[A-Za-z]{3}$/.test(body.currency)) throw new InvalidField('currency');
  const amount = body.amount_minor;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 50 || amount > 1_000_000) {
    throw new InvalidField('amount_minor');
  }
  const birth = parseBirth(body.birth, 'birth', { nameRequired: true });
  if (product === 'synastry' && (body.birth_second === undefined || body.birth_second === null)) {
    throw new InvalidField('birth_second');
  }
  const birthSecond = product === 'synastry' ? parseBirth(body.birth_second, 'birth_second') : null;
  return {
    email,
    product,
    locale: body.locale,
    country: typeof body.country === 'string' && /^[A-Za-z]{2}$/.test(body.country) ? body.country.toUpperCase() : null,
    amount_minor: amount,
    currency: body.currency.toUpperCase(),
    variant: typeof body.variant === 'string' && /^[a-z0-9_-]{1,16}$/i.test(body.variant) ? body.variant : null,
    consent: body.consent === 'granted' || body.consent === 'denied' ? body.consent : null,
    source: cleanSource(body.source),
    birth,
    birth_second: birthSecond,
  };
}

/** A campaign label as the site keeps it (lower case, a few safe characters, 24 at most). */
function cleanSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24);
  return cleaned || null;
}
