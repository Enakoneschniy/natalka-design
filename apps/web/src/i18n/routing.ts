import { defineRouting } from 'next-intl/routing';

/** Russian; German since 2026-11-02 for the owner's German audience; Ukrainian back and Polish
 * new since 2026-11-05, Poland being where the first sales came from; English (it was here until
 * 2026-09-30), French and Spanish since 2026-11-06.
 *
 * A language is this list plus its catalogue — and, by the owner's rule, the reading in it as
 * well: a buyer reads the site and the PDF in one language.
 */
export const locales = ['ru', 'uk', 'pl', 'de', 'en', 'fr', 'es'] as const;
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
  en: 'English',
  fr: 'Français',
  es: 'Español',
};
export const localeLabels: Record<Locale, string> = {
  ru: 'RU',
  uk: 'UA',
  pl: 'PL',
  de: 'DE',
  en: 'EN',
  fr: 'FR',
  es: 'ES',
};

/** The language for a visitor who typed the bare address: the first one their browser asks for
 * that the site has, and Russian when it has none of them. The country decides nothing — the
 * site's first audience is Russian-speaking, in Germany and Poland as much as anywhere, and their
 * browsers say so.
 *
 * English counts only when nothing else in the list matches: it is what a browser says when its
 * owner never changed the default, and "en-US, ru" is a Russian reader far more often than not. */
export function localeFor(acceptLanguage: string | null): Locale {
  const asked = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = Number(
        params
          .find((p) => p.trim().startsWith('q='))
          ?.trim()
          .slice(2) ?? '1',
      );
      return { base: tag.split('-')[0] ?? '', q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.base);
  const known = asked.filter((base): base is Locale =>
    (locales as readonly string[]).includes(base),
  );
  return known.find((base) => base !== 'en') ?? known[0] ?? 'ru';
}
