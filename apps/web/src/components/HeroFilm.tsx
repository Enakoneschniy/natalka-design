import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/* The hero as an opening title.
 *
 * It plays once: a star is born, a line surfaces in its light, and the chart assembles itself
 * ring by ring and planet by planet. Then it settles — the chart stays, its rings turning
 * slowly — and the page below can be read. A loop that keeps exploding every twenty seconds
 * under a headline someone is reading is a distraction, not a hero.
 *
 * All of it is CSS on one clock; reduced motion is handed the settled frame directly. */

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
      {/* The sentence is already there; the shockwave uncovers it from the centre outward as it
          passes, and it holds for a breath before the chart. One element, no per-word tricks. */}
      <p className="film-line" aria-hidden="true">
        {t('film.line')}
      </p>

      {/* scene 2 → 4: the chart */}
      <div className="film-wheel" aria-hidden="true">
        <Wheel facts={facts} size={640} animate />
      </div>

      <Link className="film-cta" href={`/${locale}/start`}>
        {t('film.cta')}
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
