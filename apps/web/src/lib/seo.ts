/** Everything the site says about itself to a machine.
 *
 * Two audiences, one set of facts: search engines, which want canonical URLs, alternates and a
 * sitemap; and the answer engines, which read the page as prose and quote it. Both are served by
 * the same plain statements — what this is, what it costs, who sells it — so they live here once.
 */

export const SITE_URL = 'https://chronika.me';

/** The shop is open to crawlers only when it can actually take money. Until then every page says
 * `noindex`, because a document that is free by accident is not something to be found by. */
export const INDEXABLE = process.env.SITE_INDEXABLE === 'true';

/** Pages that are about one visitor's own data, or one step of a purchase. They are never
 * indexed, open shop or not: there is nothing on them for anyone else. */
export const PRIVATE_PATHS = [
  '/start',
  '/subscribe',
  '/preview',
  '/checkout',
  '/generating',
  '/subscription',
  '/d/',
  '/unavailable',
] as const;

export const isPrivatePath = (pathname: string): boolean =>
  PRIVATE_PATHS.some((part) => pathname.includes(part));

/** The seller, as it stands in the register. The same details are in the public offer. */
export const SELLER = {
  legalName: 'coremind s. r. o.',
  street: 'Vlčie hrdlo 1887/81',
  postalCode: '821 07',
  city: 'Bratislava – Ružinov',
  country: 'SK',
  registration: 'IČO 57 339 368',
  email: 'help@chronika.me',
} as const;

/** What the reading costs, as a range: the price a visitor is shown is decided at the paywall by
 * the running experiment, and a single number in the markup would contradict half of them. */
export const PRICE = { low: 15, high: 35, currency: 'EUR' } as const;

export const path = (locale: string, rest = ''): string => `/${locale}${rest}`;

export const url = (locale: string, rest = ''): string => `${SITE_URL}${path(locale, rest)}`;

/** Canonical only. With one language there is nothing to point at: hreflang describes a page
 * that exists in several, and a link to a translation we do not have is worse than none. */
export function alternates(locale: string, rest = '') {
  return { canonical: url(locale, rest) };
}

/** The share card, composed by scripts/og.py. */
const shareImage = () => `${SITE_URL}/og.png`;

export function openGraph(locale: string, rest: string, title: string, description: string) {
  return {
    type: 'website' as const,
    url: url(locale, rest),
    siteName: 'Chronika',
    title,
    description,
    locale: 'ru_RU',
    images: [{ url: shareImage(), width: 1200, height: 630, alt: 'Chronika' }],
  };
}

export const twitter = (title: string, description: string) => ({
  card: 'summary_large_image' as const,
  title,
  description,
  images: [shareImage()],
});

/** `index: false` unless the shop is open and the page is one that belongs to everybody. */
export const robotsFor = (rest = '') => ({
  index: INDEXABLE && !isPrivatePath(rest || '/'),
  follow: INDEXABLE,
});
