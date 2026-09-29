import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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

        <div className="card checkout-soon">
          <h2>{t('soonTitle')}</h2>
          <p className="muted">{t('soonBody')}</p>
        </div>
      </div>
    </div>
  );
}
