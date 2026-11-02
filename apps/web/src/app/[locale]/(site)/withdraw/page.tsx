import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { WithdrawForm } from '@/components/WithdrawForm';
import { alternates } from '@/lib/seo';

/** One visitor's own declaration: never indexed. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'withdraw' });
  return {
    title: t('title'),
    alternates: alternates(locale, '/withdraw'),
    robots: { index: false, follow: true },
  };
}

/** The withdrawal function of § 356a BGB: the footer's "Vertrag widerrufen" leads here, the
 * visitor names themselves and the order, and "Widerruf bestätigen" sends it. The receipt — the
 * declaration and the moment it arrived — goes to them by email at once. */
export default async function WithdrawPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'withdraw' });
  const footer = await getTranslations({ locale, namespace: 'footer' });
  return (
    <div className="flow">
      <div className="container-page narrow">
        <h1>{t('title')}</h1>
        <p className="lead flow-lead">{t('lead')}</p>
        <WithdrawForm locale={locale} />
        <p className="caption withdraw-note">
          {t('note')} <Link href={`/${locale}/legal/refunds`}>{footer('refunds')}</Link>
        </p>
      </div>
    </div>
  );
}
