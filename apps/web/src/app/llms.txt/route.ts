import { forecastYears } from '@/components/Landing';
import { INDEXABLE, PRICE, SELLER, SITE_URL } from '@/lib/seo';
import en from '../../../messages/en.json';

/* Read at request time, not at build time: the switch that opens the site lives in the worker's
   environment, and a file baked during the build would keep whatever it said that day. */
export const dynamic = 'force-dynamic';

/** llms.txt — the site, in the form an answer engine can quote.
 *
 * A model asked "where can I get a natal chart reading with dates" does not read our CSS; it
 * reads whatever plain statement of the facts it can find. This is that statement, built from
 * the same message catalogue the pages are built from, so the two cannot drift apart. The
 * convention is a growing one rather than a standard — it costs one route and is read by
 * several crawlers already.
 */

/** The catalogue is written for the pages, where the years are filled in as the page is built.
 * Here they have to be filled in by hand — the same years, from the same clock. */
const years = (): Record<string, number> => forecastYears() as unknown as Record<string, number>;
const fill = (text: string): string =>
  text.replace(/\{(from|next|year)\}/g, (_, key: string) => String(years()[key] ?? ''));

const faq = en.landing.faq.items.map((item) => `### ${item.q}\n${fill(item.a)}`).join('\n\n');
const inside = en.landing.inside.cards
  .map((card) => `- ${card.title}: ${fill(card.text)}`)
  .join('\n');
const honest = en.landing.honest.items
  .map((item) => `- ${item.title}: ${fill(item.text)}`)
  .join('\n');

const text = `# Chronika

> A personal natal chart reading with a dated forecast, delivered as a PDF. One purchase, no
> subscription. ${PRICE.low}–${PRICE.high} ${PRICE.currency} depending on the region and the
> current pricing test.

Chronika builds a natal chart from a date, a time and a place of birth, and turns it into a
document of about 35 pages: who you are by the chart, relationships, work and money, and a
month-by-month forecast that ends in a single page of exact dates. The chart is computed from
astronomical ephemerides; the text is written by a language model following a method written by
Chronika's astrologers, and every paragraph rests on a specific position or aspect of that chart.

A free preview is built first, with no registration and no card: the wheel, the planet positions
and the first pages of the reading. Payment comes only if the reader wants the rest.

## What is inside the document
${inside}

## How it works
1. Enter date, time and place of birth. Without a time the chart is built without houses.
2. The chart and the first pages of the reading appear in about a minute, free.
3. Pay once, and the full PDF arrives by email in 20–30 minutes.

## Honest about the method
${honest}

## Languages
Ukrainian, Russian and English: ${SITE_URL}/uk, ${SITE_URL}/ru, ${SITE_URL}/en

## Pages
- [Start a reading](${SITE_URL}/en/start?p=bundle): the birth-data form and the free preview.
- A weekly or monthly horoscope from the same chart, by email or Telegram, is offered after
  the free preview.
- [Public offer](${SITE_URL}/en/legal/terms)
- [Privacy policy](${SITE_URL}/en/legal/privacy)
- [Refunds](${SITE_URL}/en/legal/refunds)

## Seller
${SELLER.legalName}, ${SELLER.street}, ${SELLER.postalCode} ${SELLER.city}, Slovakia.
${SELLER.registration}. Contact: ${SELLER.email}.

## Questions and answers
${faq}

## Not
Chronika does not predict events, name dates of death, illness or pregnancy, and does not give
medical, psychological or financial advice. The reading is for entertainment and reflection.
`;

export async function GET() {
  return new Response(INDEXABLE ? text : '# Chronika\n\nNot open yet.\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-robots-tag': INDEXABLE ? 'all' : 'noindex',
    },
  });
}
