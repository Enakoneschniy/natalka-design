import { getTranslations } from 'next-intl/server';
import { forecastYears } from '@/components/Landing';
import { locales } from '@/i18n/routing';
import { PRICE, SELLER, SITE_URL, url } from '@/lib/seo';

/** What the page says about itself in a machine's words.
 *
 * The same facts as the page, in schema.org form: who sells this, what it is, what it costs and
 * the answers to the questions people actually ask. A search engine uses it for how the result
 * is shown; an answer engine uses it to decide whether the page is worth quoting at all.
 *
 * The price is a range on purpose. What a visitor is charged is decided at the paywall by the
 * running experiment, and a single figure here would contradict half of them — which is both a
 * lie and, in Google's terms, a price mismatch.
 */
const FAQ_COUNT = 11;

export async function StructuredData({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  const meta = await getTranslations({ locale, namespace: 'meta' });
  const years = forecastYears();

  const organisation = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organisation`,
    name: 'Chronika',
    legalName: SELLER.legalName,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    email: SELLER.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SELLER.street,
      postalCode: SELLER.postalCode,
      addressLocality: SELLER.city,
      addressCountry: SELLER.country,
    },
    identifier: SELLER.registration,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SELLER.email,
      availableLanguage: ['ru'],
    },
  };

  const website = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: 'Chronika',
    inLanguage: [...locales],
    publisher: { '@id': `${SITE_URL}/#organisation` },
  };

  const product = {
    '@type': 'Product',
    '@id': `${SITE_URL}/#reading`,
    name: meta('productName', years),
    description: meta('productDescription'),
    brand: { '@id': `${SITE_URL}/#organisation` },
    category: 'Astrology reading',
    url: url(locale),
    image: `${SITE_URL}/sample/page-1.png`,
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: PRICE.low,
      highPrice: PRICE.high,
      priceCurrency: PRICE.currency,
      offerCount: 1,
      availability: 'https://schema.org/InStock',
      url: url(locale, '/start?p=bundle'),
      seller: { '@id': `${SITE_URL}/#organisation` },
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  const faq = {
    '@type': 'FAQPage',
    '@id': `${url(locale)}#faq`,
    inLanguage: locale,
    mainEntity: Array.from({ length: FAQ_COUNT }, (_, i) => ({
      '@type': 'Question',
      name: t(`faq.items.${i}.q`),
      acceptedAnswer: { '@type': 'Answer', text: t(`faq.items.${i}.a`, years) },
    })),
  };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [organisation, website, product, faq],
  };

  return (
    <script
      type="application/ld+json"
      // Our own data, and the one character that could end the script early is escaped.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other way in
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }}
    />
  );
}
