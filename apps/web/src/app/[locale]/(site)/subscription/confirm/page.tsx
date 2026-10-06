import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ConfirmSubscription } from '@/components/ConfirmSubscription';

/** One visitor's own page, behind a token: never indexed, and the address is not passed on to
 * anything it links to. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

/** Where the confirmation letter leads. The subscription starts when the button is pressed, not
 * when the page opens. */
export default async function ConfirmSubscriptionPage({
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

  return (
    <div className="flow">
      <div className="container-page narrow">
        <h1>{t('confirmTitle')}</h1>
        {token ? (
          <>
            <p className="lead flow-lead">{t('confirmLead')}</p>
            <ConfirmSubscription locale={locale} token={token} />
          </>
        ) : (
          <p className="explain">{t('confirmGone')}</p>
        )}
      </div>
    </div>
  );
}
