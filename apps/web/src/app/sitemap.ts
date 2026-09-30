import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/routing';
import { INDEXABLE, SITE_URL, url } from '@/lib/seo';

/* Read at request time, not at build time: the switch that opens the site lives in the worker's
   environment, and a file baked during the build would keep whatever it said that day. */
export const dynamic = 'force-dynamic';

/** The pages that belong to everybody: the landing in each language, and the documents a buyer
 * is entitled to read before buying. Everything else is either one visitor's own page or a step
 * of a purchase, and has no business in a sitemap. */
const PUBLIC_PAGES = ['', '/legal/terms', '/legal/privacy', '/legal/refunds'];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  const now = new Date();
  return PUBLIC_PAGES.flatMap((rest) =>
    locales.map((locale) => ({
      url: url(locale, rest),
      lastModified: now,
      changeFrequency: rest === '' ? ('weekly' as const) : ('monthly' as const),
      priority: rest === '' ? 1 : 0.4,
    })),
  );
}

export const baseUrl = SITE_URL;
