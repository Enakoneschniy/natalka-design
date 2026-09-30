import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { forecastYears } from '@/components/Landing';
import { StickyBuy } from '@/components/StickyBuy';

const PAGES = [0, 1, 2] as const;
const ITEMS = [0, 1, 2, 3] as const;

export interface TransitHint {
  /** "Март 2027" — a month, never a day: the day is what the reading is for. */
  when: string;
  /** The body whose passage it is, for the glyph. */
  body: string;
}

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

/** What the free preview stops at.
 *
 * The months come from the same transit calculation the document uses, so they are this
 * person's real dates — named without saying what they mean, which is what the reading is for.
 */
export function Paywall({
  checkoutHref,
  price,
  dates,
}: {
  checkoutHref: string;
  price: string;
  dates: TransitHint[];
}) {
  const t = useTranslations('paywall');
  const years = forecastYears();

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

      {dates.length > 0 ? (
        <div className="card paywall-dates">
          <h3>{t('datesTitle')}</h3>
          <ul>
            {dates.map((hint) => (
              <li key={hint.when}>
                <span className="mono">{hint.when}</span>
                {/* The leader line already says the answer is missing; a dash as well is noise. */}
                <span className="muted">?</span>
              </li>
            ))}
          </ul>
          <p className="caption">{t('datesNote')}</p>
        </div>
      ) : null}

      <div className="card paywall-card">
        <h2>{t('title')}</h2>
        <p className="muted">{t('lead')}</p>
        <ul>
          {ITEMS.map((i) => (
            <li key={i}>
              <Check />
              {t(`items.${i}`, years)}
            </li>
          ))}
        </ul>
        <Link className="btn btn-primary btn-lg" href={checkoutHref}>
          {t('cta', { price })}
        </Link>
        <p className="caption">{t('note')}</p>
      </div>

      {/* On a phone the offer scrolls away while the reader is still deciding. */}
      <StickyBuy href={checkoutHref} label={t('sticky', { price })} />
    </section>
  );
}
