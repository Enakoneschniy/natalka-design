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

/** A masked value and where its caret goes: just after as many digits as stood before the caret
 * in what was typed. The masks re-flow digits across the separators, and a controlled input whose
 * value changes under it puts the caret at the end — so a digit erased in the middle, the way a
 * typo gets fixed on a phone, sent the next one to the end and left a date that never parses. */
export function remask(
  mask: (value: string) => string,
  typed: string,
  caret: number,
): { value: string; caret: number } {
  const value = mask(typed);
  let digits = typed.slice(0, caret).replace(/\D/g, '').length;
  let at = 0;
  while (digits > 0 && at < value.length) {
    if (/\d/.test(value.charAt(at))) digits -= 1;
    at += 1;
  }
  return { value, caret: at };
}

/** onChange for a masked field: writes the masked value and its caret into the input before React
 * renders the same value, which then leaves the caret alone. */
export function maskInput(
  input: HTMLInputElement,
  mask: (value: string) => string,
  set: (value: string) => void,
): void {
  const { value, caret } = remask(mask, input.value, input.selectionStart ?? input.value.length);
  input.value = value;
  input.setSelectionRange(caret, caret);
  set(value);
}

/** The earliest birth an order accepts; nobody it could be for was born before. */
export const EARLIEST_BIRTH = '1900-01-01';

/** The visitor's own calendar day, YYYY-MM-DD. */
const localDay = (now: Date): string =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

/** Why a typed date is not one an order accepts: not typed in full as dd.mm.yyyy, a day the
 * calendar does not have (31.02), before 1900, or still to come. */
export type DateProblem = 'format' | 'missing' | 'early' | 'future';

/** dd.mm.yyyy → ISO, or what is wrong with it: each problem gets its own answer, since «format
 * dd.mm.yyyy» under a date typed exactly so tells the visitor nothing. */
export function readDate(
  value: string,
  now = new Date(),
): { iso: string } | { problem: DateProblem } {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return { problem: 'format' };
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(dd)) {
    return { problem: 'missing' };
  }
  if (iso < EARLIEST_BIRTH) return { problem: 'early' };
  if (iso > localDay(now)) return { problem: 'future' };
  return { iso };
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
