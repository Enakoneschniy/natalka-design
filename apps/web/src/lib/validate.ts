/** What an order or a subscription may carry, checked on our side before the jobs worker sees it.
 *
 * The limits are the jobs worker's own, so a request that passes here passes there; a visitor
 * gets the answer from us, named by field, instead of a failure from further down.
 */

import { EARLIEST_BIRTH } from './birth-input';
import type { BirthInput } from './jobs';
import { PRODUCTS, type ProductKey } from './pricing';

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_EMAIL = 254;
export const MAX_NAME = 80;
export const MAX_PLACE = 120;
export const MAX_ZONE = 64;

/** The languages a document can be written in. */
export const DOCUMENT_LOCALES = ['ru', 'uk', 'en'] as const;
export type DocumentLocale = (typeof DOCUMENT_LOCALES)[number];

export type Checked<T> = { ok: true; value: T } | { ok: false; field: string };

const fail = (field: string): { ok: false; field: string } => ({ ok: false, field });

/** Control characters out, the ends trimmed. */
export const cleanText = (value: string): string => value.replace(/\p{Cc}/gu, '').trim();

export function checkEmail(value: unknown): Checked<string> {
  if (typeof value !== 'string') return fail('email');
  const email = value.trim();
  return email.length <= MAX_EMAIL && EMAIL.test(email)
    ? { ok: true, value: email }
    : fail('email');
}

/** A calendar date that exists, YYYY-MM-DD. */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const inRange = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/** One person's birth. `field` names it in the answer (`birth`, `birth_second`); what may be left
 * out — time, place, name, form of address — is filled with "unknown". */
export function checkBirth(input: unknown, field: string, today = new Date()): Checked<BirthInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(field);
  const birth = input as Record<string, unknown>;
  const at = (name: string) => `${field}.${name}`;

  const { date } = birth;
  const latest = today.toISOString().slice(0, 10);
  if (typeof date !== 'string' || !isRealDate(date) || date < EARLIEST_BIRTH || date > latest) {
    return fail(at('date'));
  }
  const time = birth.time ?? null;
  if (time !== null && (typeof time !== 'string' || !TIME.test(time))) return fail(at('time'));
  if (!inRange(birth.latitude, 90)) return fail(at('latitude'));
  if (!inRange(birth.longitude, 180)) return fail(at('longitude'));
  const { zone } = birth;
  if (typeof zone !== 'string' || zone.length < 1 || zone.length > MAX_ZONE)
    return fail(at('zone'));
  const place = birth.place ?? '';
  if (typeof place !== 'string' || place.length > MAX_PLACE) return fail(at('place'));
  const rawName = birth.name ?? '';
  if (typeof rawName !== 'string') return fail(at('name'));
  const name = cleanText(rawName);
  if (name.length > MAX_NAME) return fail(at('name'));
  const gender = birth.gender ?? 'n';
  if (gender !== 'f' && gender !== 'm' && gender !== 'n') return fail(at('gender'));

  return {
    ok: true,
    value: {
      date,
      time,
      latitude: birth.latitude,
      longitude: birth.longitude,
      zone,
      place,
      name,
      gender,
    },
  };
}

export interface CheckedOrder {
  email: string;
  product: ProductKey;
  locale: DocumentLocale;
  birth: BirthInput;
  birth_second?: BirthInput;
}

/** The order as the browser sent it, reduced to what the jobs worker takes from the browser. The
 * price, the country and the experiment are added by the route from its own sources. */
export function checkOrder(body: unknown, today = new Date()): Checked<CheckedOrder> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('body');
  const input = body as Record<string, unknown>;

  const email = checkEmail(input.email);
  if (!email.ok) return email;
  const product = input.product;
  if (typeof product !== 'string' || !(PRODUCTS as readonly string[]).includes(product)) {
    return fail('product');
  }
  const locale = input.locale ?? 'ru';
  if (typeof locale !== 'string' || !(DOCUMENT_LOCALES as readonly string[]).includes(locale)) {
    return fail('locale');
  }
  const birth = checkBirth(input.birth, 'birth', today);
  if (!birth.ok) return birth;

  const value: CheckedOrder = {
    email: email.value,
    product: product as ProductKey,
    locale: locale as DocumentLocale,
    birth: birth.value,
  };
  if (product === 'synastry') {
    const second = checkBirth(input.birth_second, 'birth_second', today);
    if (!second.ok) return second;
    value.birth_second = second.value;
  }
  return { ok: true, value };
}
