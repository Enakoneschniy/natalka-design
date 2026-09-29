import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HeroFilm } from '@/components/HeroFilm';
import type { Locale } from '@/i18n/routing';
import type { ChartFacts } from '@/lib/chart';

/* The landing for one product.
 *
 * Everything on the page leads to the same place: the birth form, and through it to a free
 * preview. There is nothing to choose and nothing else to click — a visitor who has to pick a
 * product from five has already been given a reason to leave.
 *
 * The headline comes in three versions, chosen by `?h=` to match whichever advert brought the
 * visitor here: seeing on the page the sentence that was in the ad is most of what makes a
 * landing work. Everything below the headline is the same in all three.
 */

export type Angle = 'dates' | 'home' | 'love';
export const ANGLES: readonly Angle[] = ['dates', 'home', 'love'];

/** The window the reading covers, taken from the clock rather than written into the copy: the
 * page would otherwise quietly start lying next January. */
export function forecastYears(now = new Date()): { from: number; next: number; year: number } {
  const from = now.getFullYear();
  return { from, next: from + 1, year: from + 2 };
}

export function Landing({
  locale,
  facts,
  angle,
}: {
  locale: Locale;
  facts: ChartFacts;
  angle: Angle;
}) {
  const t = useTranslations('landing');
  const years = forecastYears();
  const start = `/${locale}/start?p=bundle`;

  const cta = (label: string, under?: string) => (
    <div className="l-cta">
      <Link className="btn btn-primary btn-lg" href={start}>
        {label}
        <span aria-hidden="true">→</span>
      </Link>
      {under ? <span className="caption">{under}</span> : null}
    </div>
  );

  return (
    <>
      <section className="hero hero-film">
        <HeroFilm facts={facts} locale={locale} />
      </section>

      <section className="section l-intro">
        <div className="container-page">
          <p className="l-eyebrow">{t('hero.eyebrow', years)}</p>
          <h1 className="l-title">{t(`hero.${angle}.title`)}</h1>
          <p className="lead l-lead">{t(`hero.${angle}.lead`, years)}</p>
          {cta(t('hero.cta'), t('hero.under'))}
          <figure className="l-quote">
            <blockquote>{t('hero.quote')}</blockquote>
            <figcaption>{t('hero.quoteFrom')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" id="asks">
        <div className="container-page">
          <div className="section-title">
            <h2>{t('asks.title')}</h2>
          </div>
          <ul className="l-asks">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i}>{t(`asks.items.${i}`, years)}</li>
            ))}
          </ul>
          <p className="lead l-note">{t('asks.note')}</p>
          {cta(t('asks.cta'))}
        </div>
      </section>

      <section className="section" id="inside">
        <div className="container-page">
          <div className="section-title">
            <h2>{t('inside.title')}</h2>
            <p className="lead">{t('inside.lead')}</p>
          </div>
          <div className="l-cards">
            {[0, 1, 2, 3].map((i) => (
              <article className="card" key={i}>
                <h3>{t(`inside.cards.${i}.title`)}</h3>
                <p className="muted">{t(`inside.cards.${i}.text`, years)}</p>
              </article>
            ))}
          </div>
          <p className="caption l-note">{t('inside.note')}</p>

          {/* Four real pages of a finished document, generated from test birth data. */}
          <ul className="l-gallery">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <a href={`/sample/page-${i + 1}.png`} target="_blank" rel="noreferrer">
                  {/* Plain <img>: these are static files of a known size and the optimiser has
                      nothing to add. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/sample/page-${i + 1}.png`}
                    alt={t(`inside.pages.${i}`)}
                    width={595}
                    height={842}
                    loading="lazy"
                  />
                  <span className="caption">{t(`inside.pages.${i}`)}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="caption l-gallery-note">{t('inside.galleryNote')}</p>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container-page">
          <div className="section-title">
            <h2>{t('steps.title')}</h2>
          </div>
          <ol className="steps">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span className="step-n mono">{`0${i + 1}`}</span>
                <h3>{t(`steps.items.${i}.title`)}</h3>
                <p className="muted">{t(`steps.items.${i}.text`)}</p>
              </li>
            ))}
          </ol>
          <p className="caption l-note">{t('steps.note')}</p>
          {cta(t('steps.cta'))}
        </div>
      </section>

      <section className="section" id="offer">
        <div className="container-page narrow">
          <div className="section-title">
            <h2>{t('offer.title')}</h2>
          </div>
          <div className="card l-offer">
            <h3>{t('offer.product', years)}</h3>
            {/* No figure here: the price is decided at the paywall, where the experiment runs,
                and a number on this page would contradict it. */}
            <p className="muted">{t('offer.meta')}</p>
            <ul>
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i}>{t(`offer.items.${i}`, years)}</li>
              ))}
            </ul>
            {cta(t('offer.cta'), t('offer.under'))}
          </div>
        </div>
      </section>

      <section className="section" id="honest">
        <div className="container-page narrow">
          <div className="section-title">
            <h2>{t('honest.title')}</h2>
          </div>
          <div className="l-honest">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <h3>{t(`honest.items.${i}.title`)}</h3>
                <p className="muted">{t(`honest.items.${i}.text`)}</p>
              </div>
            ))}
          </div>
          <p className="caption l-note">{t('honest.note')}</p>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container-page narrow">
          <div className="section-title">
            <h2>{t('faq.title')}</h2>
          </div>
          <div className="faq">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <details key={i}>
                <summary>{t(`faq.items.${i}.q`)}</summary>
                <p>{t(`faq.items.${i}.a`, years)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section l-final">
        <div className="container-page narrow">
          <h2>{t('final.title')}</h2>
          <p className="lead">{t('final.text')}</p>
          {cta(t('final.cta'), t('final.under'))}
        </div>
      </section>
    </>
  );
}
