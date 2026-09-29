'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/* The first screen as one motion piece.
 *
 * Everything that moves is a CSS animation whose period divides sixty seconds — the rings, the
 * sweep, the travelling lights, the shimmer on the gold words, the drift of the nebula — so the
 * whole scene is back where it started every minute, without a cut. The text arrives once, on
 * load, and then only breathes. The pointer tilts the layers a few pixels, which is the one thing
 * JavaScript does here. */

export function HeroScene({ facts }: { facts: ChartFacts }) {
  const t = useTranslations('hero');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = root.current;
    if (!scene) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (event: MouseEvent) => {
      const r = scene.getBoundingClientRect();
      x = (event.clientX - r.left) / r.width - 0.5;
      y = (event.clientY - r.top) / r.height - 0.5;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scene.style.setProperty('--tilt-x', x.toFixed(3));
        scene.style.setProperty('--tilt-y', y.toFixed(3));
      });
    };
    const onLeave = () => {
      scene.style.setProperty('--tilt-x', '0');
      scene.style.setProperty('--tilt-y', '0');
    };
    scene.addEventListener('mousemove', onMove, { passive: true });
    scene.addEventListener('mouseleave', onLeave);
    return () => {
      scene.removeEventListener('mousemove', onMove);
      scene.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  const lines = [t('titleLead'), t('titleAccent')];

  return (
    <div className="scene" ref={root}>
      {/* depth: a nebula that drifts and a ring of light behind the wheel */}
      <div className="scene-nebula scene-layer-far" aria-hidden="true" />

      <div className="scene-text scene-layer-near">
        <h1 className="scene-title">
          {lines.map((line, i) => (
            <span key={line} className="scene-line">
              <span
                className={`reveal${i === 1 ? ' scene-accent' : ''}`}
                style={{ '--i': i + 1 } as React.CSSProperties}
              >
                {line}
              </span>
            </span>
          ))}
        </h1>
        <p className="scene-lead reveal" style={{ '--i': 3 } as React.CSSProperties}>
          {t('lead')}
        </p>
        <ul className="scene-facts reveal" style={{ '--i': 4 } as React.CSSProperties}>
          <li>
            <strong>{t('facts.accuracy')}</strong>
            <span>{t('facts.accuracyLabel')}</span>
          </li>
          <li>
            <strong>{t('facts.speed')}</strong>
            <span>{t('facts.speedLabel')}</span>
          </li>
          <li>
            <strong>{t('facts.count')}</strong>
            <span>{t('facts.countLabel')}</span>
          </li>
        </ul>
      </div>

      <div className="scene-wheel scene-layer-mid" aria-hidden="true">
        <div className="scene-wheel-inner">
          <Wheel facts={facts} size={640} animate />
          {/* three rings, each on its own period, and a sweep of light that circles the chart */}
          <span className="scene-ring scene-ring-1" />
          <span className="scene-ring scene-ring-2">
            <span className="scene-light" />
          </span>
          <span className="scene-ring scene-ring-3">
            <span className="scene-light scene-light-gold" />
          </span>
          <svg className="scene-sweep" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" pathLength="100" />
          </svg>
        </div>
      </div>

      <div className="scene-cue" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
