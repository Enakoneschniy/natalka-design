import { headers } from 'next/headers';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { type Locale, localesFor } from '@/i18n/routing';

/** The pages that live inside the site: header above, footer below. The waiting screen at
 * /generating sits outside this group on purpose — it has no navigation to offer. */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const country = (await headers()).get('cf-ipcountry');
  const available = localesFor(country);
  return (
    <>
      <SiteHeader locale={locale as Locale} available={available} />
      <main>{children}</main>
      <SiteFooter locale={locale as Locale} />
    </>
  );
}
