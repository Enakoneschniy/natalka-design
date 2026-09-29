import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/* The hero as a short film.
 *
 * Four scenes on one loop, all CSS keyframes on the same clock, so nothing drifts and the last
 * frame is the first: a star being born and a sentence under it; the chart drawing itself, ring
 * by ring, planet by planet; the chart stepping aside for a passage of the reading; the headline.
 * No columns, no statistics, no buttons — one line of a link at the foot. Reduced motion shows
 * the final frame. */

const STREAKS = Array.from({ length: 56 }, (_, i) => ({
  i,
  angle: (i * 137.508) % 360,
  length: 0.45 + ((i * 7) % 11) / 10,
  delay: ((i * 5) % 9) * 0.035,
}));

export function HeroFilm({ facts, locale }: { facts: ChartFacts; locale: string }) {
  const t = useTranslations('hero');
  return (
    <div className="film" aria-label={`${t('titleLead')} ${t('titleAccent')}`}>
      <div className="film-glow" aria-hidden="true" />

      {/* scene 1: a star is born — a point, a flash, a shockwave, the sky rushing past — and the
          sentence surfaces as the light settles. The streaks are laid out by the golden angle so
          that no two neighbours are alike, without a random number the server could not repeat. */}
      <div className="film-burst" aria-hidden="true" />
      <div className="film-shock" aria-hidden="true" />
      <div className="film-warp" aria-hidden="true">
        {STREAKS.map((streak) => (
          <i
            key={streak.i}
            style={
              {
                '--a': `${streak.angle}deg`,
                '--l': streak.length,
                '--d': `${streak.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <p className="film-line" aria-hidden="true">
        {t('film.line')}
      </p>

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
