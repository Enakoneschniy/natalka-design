import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { forecastYears } from '@/components/Landing';
import { Sky } from '@/components/Sky';
import { routing } from '@/i18n/routing';
import { alternates, openGraph, robotsFor, SITE_URL, twitter } from '@/lib/seo';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const title = `${t('title')} — Chronika`;
  const description = t('description', forecastYears());
  return {
    // A page that sets no title of its own is the landing; the rest override both.
    title: { default: title, template: '%s — Chronika' },
    description,
    metadataBase: new URL(SITE_URL),
    alternates: alternates(locale),
    openGraph: openGraph(locale, '', title, description),
    twitter: twitter(title, description),
    // Closed to search engines until the shop can take money. The middleware sends the same
    // answer as a header, which also covers the PDFs and the API routes.
    robots: robotsFor(),
    applicationName: 'Chronika',
    category: 'astrology',
    // Search Console and Bing hand out a token each; they go in the worker's environment, not
    // in the repository, and are simply absent until they are set.
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION,
      other: process.env.BING_SITE_VERIFICATION
        ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
        : {},
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Cormorant+Garamond:wght@300;400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextIntlClientProvider>
          <Sky />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
