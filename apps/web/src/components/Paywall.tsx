import Link from 'next/link';
import { useTranslations } from 'next-intl';

const PAGES = [0, 1, 2] as const;
const ITEMS = [0, 1, 2, 3] as const;

function Check() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

/** What the free preview stops at: blurred sample pages behind the offer for the full reading. */
export function Paywall({
  checkoutHref,
  forecastHref,
  bundleHref,
  natal,
  forecast,
  bundle,
  bundleFull,
}: {
  checkoutHref: string;
  forecastHref: string;
  bundleHref: string;
  natal: string;
  forecast: string;
  bundle: string;
  bundleFull: string;
}) {
  const t = useTranslations('paywall');

  return (
    <section className="paywall">
      {/* Decorative: sample pages from a reading, blurred — never read out or selectable. */}
      <div className="pages" aria-hidden="true">
        {PAGES.map((i) => (
          <div className="page" key={i}>
            <div className="page-head">
              <span>{t(`pages.${i}.section`)}</span>
              <span className="mono">{t(`pages.${i}.page`)}</span>
            </div>
            <h4 className="page-h">{t(`pages.${i}.title`)}</h4>
            <p className="page-p">{t(`pages.${i}.body.0`)}</p>
            <p className="page-p">{t(`pages.${i}.body.1`)}</p>
          </div>
        ))}
      </div>
      <div className="fade" aria-hidden="true" />

      <div className="card paywall-card">
        <h2>{t('title')}</h2>
        <p className="muted">{t('lead')}</p>
        <ul>
          {ITEMS.map((i) => (
            <li key={i}>
              <Check />
              {t(`items.${i}`)}
            </li>
          ))}
        </ul>
        <Link className="btn btn-primary btn-lg" href={checkoutHref}>
          {t('cta', { price: natal })}
        </Link>
        <p className="caption">{t('note')}</p>
      </div>

      <p className="more-products">
        {t('more')} <Link href={forecastHref}>{t('forecast', { price: forecast })}</Link> ·{' '}
        <Link href={bundleHref}>{t('bundle', { price: bundle, full: bundleFull })}</Link>
      </p>
    </section>
  );
}
