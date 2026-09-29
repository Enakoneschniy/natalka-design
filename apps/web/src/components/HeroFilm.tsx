import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/Logo';
import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/* The first screen, as one piece.
 *
 * It plays once: a star is born, a line surfaces in its light, the chart assembles itself ring by
 * ring — and then the chart steps aside and the page's own words arrive in its place. After that
 * it is still: a hero that keeps re-exploding under a headline someone is reading is a
 * distraction, not a hero.
 *
 * There is no site header above it. One product, one language a visitor ever sees, and a call to
 * action in every section below — a navigation bar would be three links to nowhere.
 */

const STREAKS = Array.from({ length: 56 }, (_, i) => ({
  i,
  angle: (i * 137.508) % 360,
  length: 0.45 + ((i * 7) % 11) / 10,
  delay: ((i * 5) % 9) * 0.035,
}));

export function HeroFilm({
  facts,
  locale,
  angle,
  years,
}: {
  facts: ChartFacts;
  locale: string;
  /** Which of the three headlines this visitor's advert promised. */
  angle: 'dates' | 'home' | 'love';
  years: { from: number; next: number; year: number };
}) {
  const t = useTranslations('landing');

  return (
    <div className="film">
      <Link className="film-mark" href={`/${locale}`} aria-label="Chronika">
        <Logo size={28} />
        <span>Chronika</span>
      </Link>

      <div className="film-glow" aria-hidden="true" />

      {/* a star is born: a point, a flash, a shockwave, and the sky rushing past the camera */}
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

      {/* the line the wave uncovers, held long enough to read */}
      <p className="film-line" aria-hidden="true">
        {t('hero.line')}
      </p>

      <div className="film-wheel" aria-hidden="true">
        <Wheel facts={facts} size={640} animate />
      </div>

      {/* and then the page says what it is */}
      <div className="film-text">
        <p className="film-eyebrow">{t('hero.eyebrow', years)}</p>
        <h1 className="film-title">{t(`hero.${angle}.title`)}</h1>
        <p className="film-lead">{t(`hero.${angle}.lead`, years)}</p>
        <Link className="btn btn-primary btn-lg film-button" href={`/${locale}/start?p=bundle`}>
          {t('hero.cta')}
          <span aria-hidden="true">→</span>
        </Link>
        <p className="caption film-under">{t('hero.under')}</p>
      </div>
    </div>
  );
}
