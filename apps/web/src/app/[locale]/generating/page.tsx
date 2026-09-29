import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GenerationProgress } from '@/components/GenerationProgress';
import { Stepper } from '@/components/Stepper';

export const dynamic = 'force-dynamic';

export default async function GeneratingPage({
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
  const t = await getTranslations({ locale, namespace: 'generating' });

  return (
    <div className="flow">
      <div className="container-page narrow">
        <div className="flow-head">
          <Stepper current="payment" />
        </div>
        <h1>{t('title')}</h1>
        <p className="lead flow-lead">{t('lead')}</p>
        {token ? (
          <GenerationProgress token={token} locale={locale} />
        ) : (
          <p className="explain">{t('noToken')}</p>
        )}
      </div>
    </div>
  );
}
