import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SubscribeForm } from '@/components/SubscribeForm';
import { subscriptionPrice } from '@/lib/pricing';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  // A step of a purchase, carrying one person's birth data in the query.
  return { title: t('subscribeTitle'), robots: { index: false, follow: false } };
}

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** The last step of a subscription: cadence, email, consent. The birth data arrives in the query,
 * the way the form wrote it, and is shown back so a mistake is caught before the chart is kept. */
export default async function SubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const t = await getTranslations({ locale, namespace: 'subscription' });
  const tf = await getTranslations({ locale, namespace: 'form' });
  const country = (await headers()).get('cf-ipcountry');
  const price = subscriptionPrice(country).formatted;

  const date = one(search.d);
  const zone = one(search.tz);
  const latitude = Number(one(search.lat));
  const longitude = Number(one(search.lon));
  const gender = one(search.g);
  const birth =
    date && zone && !Number.isNaN(latitude) && !Number.isNaN(longitude)
      ? {
          date,
          time: one(search.t) ?? null,
          latitude,
          longitude,
          zone,
          place: one(search.c) ?? '',
          name: one(search.n) ?? '',
          gender: (gender === 'f' ? 'f' : gender === 'm' ? 'm' : 'n') as 'f' | 'm' | 'n',
        }
      : null;

  return (
    <div className="flow">
      <div className="container-page narrow">
        <div className="flow-head">
          {/* Back to an empty form: the form page carries advertising tags, so the birth data
              does not go with the link. */}
          <Link className="small" href={`/${locale}/start?p=horoscope`}>
            {tf('edit')}
          </Link>
        </div>
        <h1>{t('title')}</h1>
        <p className="lead flow-lead">{t('lead')}</p>
        {birth ? (
          <>
            <div className="card summary-card">
              <div className="item">
                <div>
                  <strong>{birth.name || tf('titles.horoscope')}</strong>
                  <span className="muted mono">
                    {[
                      birth.date.split('-').reverse().join('.'),
                      birth.time ?? tf('timeUnknown'),
                      birth.place,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <span className="mono">{t('trial')}</span>
              </div>
            </div>
            <SubscribeForm locale={locale} birth={birth} price={price} />
          </>
        ) : (
          <p className="explain">{tf('errors.date')}</p>
        )}
      </div>
    </div>
  );
}
