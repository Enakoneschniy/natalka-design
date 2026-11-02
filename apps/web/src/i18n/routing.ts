import { defineRouting } from 'next-intl/routing';

/** Russian, and German since 2026-11-02 for the owner's German audience.
 *
 * Ukrainian and English were here once and went on 2026-09-30, because nobody advertised them;
 * their catalogues are in this repository's history. A language comes back as this list plus its
 * catalogue — and stays only while someone is sent to it.
 */
export const locales = ['ru', 'de'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ru';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  // The middleware picks the language for the bare address itself; see `localeFor`.
  localeDetection: false,
});

export const localeNames: Record<Locale, string> = { ru: 'Русский', de: 'Deutsch' };
export const localeLabels: Record<Locale, string> = { ru: 'RU', de: 'DE' };

/** The language for a visitor who typed the bare address: German when the browser asks for
 * German first, Russian otherwise. The country decides nothing — the Russian-speaking audience
 * in Germany is the site's first one, and their browsers say so. */
export function localeFor(acceptLanguage: string | null): Locale {
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first === 'de' || first.startsWith('de-') ? 'de' : 'ru';
}
