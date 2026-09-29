import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GenerationProgress } from '@/components/GenerationProgress';

export const dynamic = 'force-dynamic';

/** A waiting room, not a page of the site: one screen tall, no navigation to wander off into,
 * and a way back. The layout drops the header and the footer for this route. */
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
    <div className="waiting-screen">
      <Link className="back-link" href={`/${locale}`}>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M9.5 3.5L5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('back')}
      </Link>
      {token ? (
        <GenerationProgress token={token} />
      ) : (
        <div className="waiting-text">
          <h1>{t('goneTitle')}</h1>
          <p className="lead">{t('noToken')}</p>
        </div>
      )}
    </div>
  );
}
