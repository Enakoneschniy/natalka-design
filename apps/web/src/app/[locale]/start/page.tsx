import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BirthForm } from '@/components/BirthForm';
import { Stepper } from '@/components/Stepper';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'form' });
  return { title: `Natalka — ${t('title')}` };
}

export default async function StartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'form' });

  return (
    <div className="flow">
      <div className="container-page narrow">
        <div className="flow-head">
          <Stepper current="data" />
        </div>
        <h1>{t('title')}</h1>
        <p className="lead flow-lead">{t('lead')}</p>
        <BirthForm locale={locale} />
      </div>
    </div>
  );
}
