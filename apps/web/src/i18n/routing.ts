import { defineRouting } from 'next-intl/routing';

/** Russian; German since 2026-11-02 for the owner's German audience; Ukrainian back and Polish
 * new since 2026-11-05, Poland being where the first sales came from.
 *
 * English was here once and went on 2026-09-30, because nobody advertised it; its catalogue is in
 * this repository's history. A language is this list plus its catalogue — and, by the owner's
 * rule, the reading in it as well: a buyer reads the site and the PDF in one language.
 */
export const locales = ['ru', 'uk', 'pl', 'de'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ru';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  // The middleware picks the language for the bare address itself; see `localeFor`.
  localeDetection: false,
});

export const localeNames: Record<Locale, string> = {
  ru: 'Русский',
  uk: 'Українська',
  pl: 'Polski',
  de: 'Deutsch',
};
export const localeLabels: Record<Locale, string> = { ru: 'RU', uk: 'UA', pl: 'PL', de: 'DE' };

/** The language for a visitor who typed the bare address: the one their browser asks for first,
 * when the site has it, and Russian otherwise. The country decides nothing — the site's first
 * audience is Russian-speaking, in Germany and Poland as much as anywhere, and their browsers say
 * so. */
export function localeFor(acceptLanguage: string | null): Locale {
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  const base = first.split(/[-;]/)[0] ?? '';
  return (locales as readonly string[]).includes(base) ? (base as Locale) : 'ru';
}
