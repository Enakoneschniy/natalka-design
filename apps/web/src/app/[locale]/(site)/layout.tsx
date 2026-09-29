import { SiteFooter } from '@/components/SiteFooter';
import type { Locale } from '@/i18n/routing';

/** The pages that live inside the site. There is no header: one product, one language a visitor
 * ever sees, and a call to action in every section — a navigation bar would be links to nowhere.
 * The mark sits in the hero; the footer carries the documents and the contact. */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <>
      <main>{children}</main>
      <SiteFooter locale={locale as Locale} />
    </>
  );
}
