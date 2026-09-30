import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BirthForm } from '@/components/BirthForm';
import { Stepper } from '@/components/Stepper';
import { PRODUCTS } from '@/lib/pricing';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'form' });
  // The form is a step of a purchase, not a page anyone should arrive at from a search.
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function StartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const asked = Array.isArray(search.p) ? search.p[0] : search.p;
  // The horoscope subscription takes the same form but leads to a subscription, not a preview.
  const product =
    asked === 'horoscope' || (PRODUCTS as readonly string[]).includes(asked ?? '')
      ? (asked as string)
      : 'natal';
  const t = await getTranslations({ locale, namespace: 'form' });

  return (
    <div className="flow">
      <div className="container-page narrow">
        <div className="flow-head">
          <Stepper current="data" />
        </div>
        <h1>{t(`titles.${product}`)}</h1>
        <p className="lead flow-lead">
          {product === 'synastry' || product === 'child' || product === 'horoscope'
            ? t(`leads.${product}`)
            : t('lead')}
        </p>
        <BirthForm locale={locale} product={product} />
      </div>
    </div>
  );
}
