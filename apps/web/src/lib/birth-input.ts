/** How a birth is typed: the masks for the date and time fields and the label for a picked city.
 * Plain functions, shared by the shop's `PersonFields` and the seller cabinet. */

import type { City } from '@/app/api/cities/route';

/** Keep the digits the user typed and insert the separators for them. */
export function maskDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.');
}

export function maskTime(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** The earliest birth an order accepts; nobody it could be for was born before. */
export const EARLIEST_BIRTH = '1900-01-01';

/** The visitor's own calendar day, YYYY-MM-DD. */
const localDay = (now: Date): string =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

/** dd.mm.yyyy → ISO, or null when the date does not exist (31.02), is before 1900 or is still to
 * come — the range an order accepts. */
export function parseDate(value: string, now = new Date()): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(dd)) return null;
  if (iso < EARLIEST_BIRTH || iso > localDay(now)) return null;
  return iso;
}

/** h:mm or hh:mm → hh:mm, or null when it is not a time of day. */
export function parseTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, hh, mm] = match as unknown as [string, string, string];
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return `${hh.padStart(2, '0')}:${mm}`;
}

/** «Евпатория, Крым, Украина»: the city, its region and country, whichever are known. */
export const cityLabel = (city: City): string =>
  [city.name, city.region, city.country].filter(Boolean).join(', ');
