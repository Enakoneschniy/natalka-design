import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Sky } from '@/components/Sky';
import { type Locale, localesFor, routing } from '@/i18n/routing';
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
  const t = await getTranslations({ locale, namespace: 'hero' });
  return {
    title: `Chronika — ${t('titleLead')} ${t('titleAccent')}`,
    description: t('lead'),
    metadataBase: new URL('https://chronika.me'),
    // Closed to search engines until the shop actually sells something. The middleware sends the
    // same answer as a header, which also covers the PDFs and the API routes.
    robots: { index: false, follow: false },
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

  const requestHeaders = await headers();
  const country = requestHeaders.get('cf-ipcountry');
  const available = localesFor(country);
  // One screen in the funnel is a waiting room: no navigation, no footer, nothing to click away
  // to while a document is being written.
  const focused = (requestHeaders.get('x-pathname') ?? '').includes('/generating');

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextIntlClientProvider>
          <Sky />
          {focused ? null : <SiteHeader locale={locale as Locale} available={available} />}
          <main>{children}</main>
          {focused ? null : <SiteFooter locale={locale as Locale} />}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
