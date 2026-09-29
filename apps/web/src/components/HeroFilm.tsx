import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/* The hero as a short film.
 *
 * Four scenes on one 24-second loop, all CSS keyframes on the same clock, so nothing drifts and
 * the last frame is the first: a sentence under the stars; the chart drawing itself, ring by
 * ring, planet by planet; the chart stepping aside for a passage of the reading; the headline.
 * No columns, no statistics, no buttons — one line of a link at the foot. Reduced motion shows
 * the final frame. */

export function HeroFilm({ facts, locale }: { facts: ChartFacts; locale: string }) {
  const t = useTranslations('hero');
  return (
    <div className="film" aria-label={`${t('titleLead')} ${t('titleAccent')}`}>
      <div className="film-glow" aria-hidden="true" />

      {/* scene 1: a sentence, and a ring drawing itself around where the chart will be */}
      <p className="film-line" aria-hidden="true">
        {t('film.line')}
      </p>
      <svg className="film-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="47" pathLength="1" />
      </svg>

      {/* scene 2 → 4: the chart */}
      <div className="film-wheel" aria-hidden="true">
        <Wheel facts={facts} size={640} animate />
      </div>

      {/* scene 3: a passage of the reading */}
      <figure className="film-quote" aria-hidden="true">
        <blockquote>{t('film.quote')}</blockquote>
        <figcaption>{t('film.quoteFrom')}</figcaption>
      </figure>

      {/* scene 4: the headline */}
      <h1 className="film-title">
        <span className="film-title-line">
          <span>{t('titleLead')}</span>
        </span>
        <span className="film-title-line">
          <span className="film-title-accent">{t('titleAccent')}</span>
        </span>
      </h1>

      <Link className="film-cta" href={`/${locale}/start`}>
        {t('film.cta')}
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
