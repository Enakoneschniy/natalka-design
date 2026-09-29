import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/* The first screen.
 *
 * One composition rather than two columns side by side: the chart is large and runs off the
 * right edge, the words sit over its glow, and a thin line of facts closes the screen at the
 * bottom. It plays in once — a star, a line in its light, the chart assembling ring by ring, the
 * words arriving — and then holds still, because a hero that keeps moving under a headline
 * someone is reading is a distraction.
 *
 * Above it there is only the mark, which the layout draws for every page.
 */

const STREAKS = Array.from({ length: 48 }, (_, i) => ({
  i,
  angle: (i * 137.508) % 360,
  length: 0.45 + ((i * 7) % 11) / 10,
  delay: ((i * 5) % 9) * 0.035,
}));

const FACTS = [0, 1, 2] as const;

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
      {/* The chart is the backdrop, not a picture beside the text: it is bigger than the screen
          and cropped by it, which is what stops it reading as a circle floating in a box. */}
      <div className="film-stage" aria-hidden="true">
        <div className="film-glow" />
        <div className="film-burst" />
        <div className="film-shock" />
        <div className="film-warp">
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
        <div className="film-wheel">
          <Wheel facts={facts} size={640} animate />
        </div>
      </div>

      <p className="film-line" aria-hidden="true">
        {t('hero.line')}
      </p>

      <div className="film-inner">
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

        {/* The line that closes the screen: what the thing is, in three facts, with the cue to
            scroll. Without it the bottom half of a tall monitor is empty. */}
        <div className="film-foot">
          <ul className="film-facts">
            {FACTS.map((i) => (
              <li key={i}>{t(`hero.facts.${i}`)}</li>
            ))}
          </ul>
          <span className="film-cue" aria-hidden="true">
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}
