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

/** «Евпатория, Крым, Украина»: the city, its region and country, whichever are known. */
export const cityLabel = (city: City): string =>
  [city.name, city.region, city.country].filter(Boolean).join(', ');
