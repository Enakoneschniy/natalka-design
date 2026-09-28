import { defineRouting } from 'next-intl/routing';

/** Russian is offered everywhere except Ukraine — see `isRussianAllowed` and middleware.ts. */
export const locales = ['uk', 'en', 'ru'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'uk';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
});

export const localeNames: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  ru: 'Русский',
};

export const localeLabels: Record<Locale, string> = { uk: 'UA', en: 'EN', ru: 'RU' };

/** country → locale, used with the Cloudflare `cf-ipcountry` header. */
export const countryLocale: Record<string, Locale> = {
  UA: 'uk',
  PL: 'en',
  DE: 'en',
};

export const isRussianAllowed = (country: string | null): boolean => country !== 'UA';

export const localesFor = (country: string | null): Locale[] =>
  isRussianAllowed(country) ? [...locales] : locales.filter((l) => l !== 'ru');
