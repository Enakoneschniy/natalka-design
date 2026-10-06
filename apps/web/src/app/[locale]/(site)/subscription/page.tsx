import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SubscriptionPanel } from '@/components/SubscriptionPanel';

/** One visitor's own page, behind a token: never indexed, open shop or not, and the address is
 * not passed on to anything it links to. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

/** Everything about one subscription, behind its signed link: the latest horoscope, the
 * cadence, pause and cancel, the Telegram binding, and the way to delete it all. */
export default async function SubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const token = Array.isArray(search.t) ? search.t[0] : search.t;
  const t = await getTranslations({ locale, namespace: 'subscription' });
  const bot = process.env.TELEGRAM_BOT_USERNAME ?? '';

  return (
    <div className="flow">
      <div className="container-page narrow">
        <h1>{t('manageTitle')}</h1>
        {token ? (
          <SubscriptionPanel token={token} bot={bot} />
        ) : (
          <p className="explain">{t('gone')}</p>
        )}
      </div>
    </div>
  );
}
