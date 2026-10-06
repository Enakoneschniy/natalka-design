import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StartGeneration } from '@/components/StartGeneration';
import { Stepper } from '@/components/Stepper';
import { EXPERIMENT_COOKIE, readVariant } from '@/lib/experiment';
import { bundlePrice, PRODUCTS, type ProductKey, priceFor } from '@/lib/pricing';
import { count } from '@/lib/stats';
import { cleanText, MAX_NAME, MAX_PLACE } from '@/lib/validate';

/** One visitor's own page: never indexed, open shop or not. */
export const metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

/** Mirrors the list in /api/orders: the payment provider does not allow the sale there. */
const NOT_SOLD_TO = new Set(['JP', 'MX', 'TH']);

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isProduct = (value: string | undefined): value is ProductKey =>
  PRODUCTS.includes(value as ProductKey);

/** Order summary. Payments are not connected yet, so this screen states that plainly. */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const t = await getTranslations({ locale, namespace: 'checkout' });
  const tp = await getTranslations({ locale, namespace: 'products' });

  const country = (await headers()).get('cf-ipcountry');
  const product = isProduct(one(search.p)) ? (one(search.p) as ProductKey) : 'natal';
  const variant = await readVariant((await cookies()).get(EXPERIMENT_COOKIE)?.value);
  const price = product === 'bundle' ? bundlePrice(country, variant) : priceFor(product, country);
  await count('checkout', { variant });

  const birth = [
    one(search.d)?.split('-').reverse().join('.'),
    one(search.t) ?? t('unknownTime'),
    one(search.c),
  ].filter(Boolean);

  // Enough to start a generation; the same values the preview was drawn from. The partner's
  // fields carry a "2", the way the form wrote them. The name and the place are cut to what an
  // order may carry.
  const person = (suffix: '' | '2', fallbackName: string) => {
    const date = one(search[`d${suffix}`]);
    const zone = one(search[`tz${suffix}`]);
    const latitude = Number(one(search[`lat${suffix}`]));
    const longitude = Number(one(search[`lon${suffix}`]));
    if (!date || !zone || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
    const gender = one(search[`g${suffix}`]);
    const time = one(search[`t${suffix}`]);
    return {
      date,
      time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
      latitude,
      longitude,
      zone,
      place: (one(search[`c${suffix}`]) ?? '').slice(0, MAX_PLACE),
      name: cleanText(one(search[`n${suffix}`]) ?? fallbackName).slice(0, MAX_NAME),
      gender: (gender === 'f' || gender === 'female'
        ? 'f'
        : gender === 'm' || gender === 'male'
          ? 'm'
          : 'n') as 'f' | 'm' | 'n',
    };
  };
  const first = person('', tp(`${product}.title`));
  const second = product === 'synastry' ? person('2', 'B') : null;
  const canStart = Boolean(first) && (product !== 'synastry' || Boolean(second));

  const back = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const single = one(value);
    if (single && key !== 'p') back.set(key, single);
  }

  return (
    <div className="flow">
      <div className="container-page narrow">
        <div className="flow-head">
          <Stepper current="payment" />
          <Link className="small" href={`/${locale}/preview?${back.toString()}`}>
            {t('back')}
          </Link>
        </div>

        <h1>{t('title')}</h1>

        <div className="card summary-card">
          <h2 className="block-title">{t('summary')}</h2>
          <div className="item">
            <div>
              <strong>{tp(`${product}.title`)}</strong>
              <span className="muted">{tp(`${product}.meta`)}</span>
            </div>
            <span className="mono">{price.formatted}</span>
          </div>
          {birth.length > 0 ? (
            <div className="item">
              <div>
                <strong>{t('chart')}</strong>
                <span className="muted mono">{birth.join(' · ')}</span>
              </div>
            </div>
          ) : null}
          <div className="total">
            <span>{t('total')}</span>
            <span className="num">{price.formatted}</span>
          </div>
        </div>

        {canStart && first ? (
          <StartGeneration
            locale={locale}
            product={product}
            birth={first}
            birthSecond={second ?? undefined}
            blocked={Boolean(country && NOT_SOLD_TO.has(country.toUpperCase()))}
          />
        ) : null}

        <div className="card checkout-soon">
          <h2>{t('howTitle')}</h2>
          <p className="muted">{t('howBody')}</p>
        </div>
      </div>
    </div>
  );
}
