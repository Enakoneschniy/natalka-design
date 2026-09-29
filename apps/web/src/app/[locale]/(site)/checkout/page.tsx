import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StartGeneration } from '@/components/StartGeneration';
import { Stepper } from '@/components/Stepper';
import { PRODUCTS, type ProductKey, priceFor } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

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
  const price = priceFor(product, country);

  const birth = [
    one(search.d)?.split('-').reverse().join('.'),
    one(search.t) ?? t('unknownTime'),
    one(search.c),
  ].filter(Boolean);

  // Enough to start a generation; the same values the preview was drawn from. The partner's
  // fields carry a "2", the way the form wrote them.
  const person = (suffix: '' | '2', fallbackName: string) => {
    const date = one(search[`d${suffix}`]);
    const zone = one(search[`tz${suffix}`]);
    const latitude = Number(one(search[`lat${suffix}`]));
    const longitude = Number(one(search[`lon${suffix}`]));
    if (!date || !zone || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
    const gender = one(search[`g${suffix}`]);
    return {
      date,
      time: one(search[`t${suffix}`]) ?? null,
      latitude,
      longitude,
      zone,
      place: one(search[`c${suffix}`]) ?? '',
      name: one(search[`n${suffix}`]) ?? fallbackName,
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
          />
        ) : null}

        <div className="card checkout-soon">
          <h2>{t('soonTitle')}</h2>
          <p className="muted">{t('soonBody')}</p>
        </div>
      </div>
    </div>
  );
}
