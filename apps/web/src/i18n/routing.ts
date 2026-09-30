import { defineRouting } from 'next-intl/routing';

/** One language.
 *
 * The site was built for three and every string was translated, but only the Russian version is
 * sold and promoted, and a language nobody advertises is a page nobody reads and a translation
 * nobody keeps true. The Ukrainian and English catalogues are in the history of this repository
 * (messages/uk.json, messages/en.json, before this commit) if one of them is ever opened again;
 * bringing it back is this file plus its catalogue.
 */
export const locales = ['ru'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ru';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: false,
});
