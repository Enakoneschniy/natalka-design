'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const TILE = 512;
/** Second layer at a different size so the two patterns only repeat together far off-screen. */
const TILE_ALT = 347;

/** Draw a seamless star tile: stars near an edge are repeated on the opposite one. */
function starTile(size: number, count: number, seed: number, dpr: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let state = seed;
  const rnd = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };

  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rnd() < 0.08 ? 1.3 : rnd() < 0.5 ? 0.9 : 0.6;
    const alpha = 0.15 + rnd() * 0.55;
    ctx.fillStyle = rnd() < 0.12 ? `rgba(240,200,140,${alpha})` : `rgba(220,228,255,${alpha})`;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return canvas.toDataURL('image/png');
}

/** The stars that actually twinkle.
 *
 * Animating the whole field would mean redrawing a canvas every frame for a background nobody
 * looks at directly. These are separate elements the compositor fades on its own, so the count
 * follows the height of the page: what matters is how many are on the screen at once, and a
 * fixed number spread over a long page leaves two per screenful, which reads as nothing.
 */
const PER_SCREEN = 11;
const MOST = 140;

interface Twinkler {
  id: number;
  top: string;
  left: string;
  size: number;
  duration: number;
  delay: number;
  gold: boolean;
}

function twinklers(count: number): Twinkler[] {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, id) => ({
    id,
    top: `${(rnd() * 98 + 1).toFixed(2)}%`,
    left: `${(rnd() * 98 + 1).toFixed(2)}%`,
    size: rnd() < 0.3 ? 3 : 2,
    duration: 2.4 + rnd() * 3.6,
    // A negative delay starts each one part-way through, so they are never in step.
    delay: -rnd() * 6,
    gold: rnd() < 0.25,
  }));
}

interface Shot {
  id: number;
  top: string;
  left: string;
  length: number;
  angle: number;
  duration: number;
}

/** A shooting star: one streak, then gone. Rare enough to be a small event — a sky where they
 * arrive every three seconds stops being a sky and becomes a screensaver. */
const SHOT_MIN_MS = 9000;
const SHOT_SPREAD_MS = 16000;

function shot(id: number): Shot {
  const rnd = Math.random;
  // Downward and to one side, the way a real one crosses: never straight across the screen.
  const rightwards = rnd() < 0.5;
  const angle = (rightwards ? 1 : -1) * (18 + rnd() * 22);
  return {
    id,
    top: `${(rnd() * 45 + 4).toFixed(1)}%`,
    left: `${(rightwards ? rnd() * 45 : rnd() * 45 + 50).toFixed(1)}%`,
    length: 90 + rnd() * 120,
    angle,
    duration: 0.9 + rnd() * 0.7,
  };
}

/** How much slower the far layer travels than the page. Small on purpose: the sky should feel
 * deep, not detached — anything past a fifth reads as the background sliding. */
const PARALLAX = 0.18;

export function Sky() {
  const ref = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const [stars, setStars] = useState<Twinkler[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);

  useEffect(() => {
    const sky = ref.current;
    if (!sky) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nearTile = starTile(TILE, 30, 7, dpr);
    const farTile = starTile(TILE_ALT, 14, 13, dpr);
    if (!nearTile || !farTile) return;
    sky.style.backgroundImage = `url(${nearTile})`;
    sky.style.backgroundSize = `${TILE}px ${TILE}px`;
    if (far.current) {
      far.current.style.backgroundImage = `url(${farTile})`;
      far.current.style.backgroundSize = `${TILE_ALT}px ${TILE_ALT}px`;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Positions are decided after mount: the server has no business guessing them, and a random
    // value in the markup is a hydration mismatch waiting to happen.
    const fill = () => {
      const screens = Math.max(1, document.body.scrollHeight / window.innerHeight);
      const count = Math.min(MOST, Math.round(screens * PER_SCREEN));
      setStars((current) => (current.length === count ? current : twinklers(count)));
    };
    fill();

    // This component lives in the layout, so it outlives the page it was mounted on: without
    // this, a short page that navigates to a long one keeps the short page's handful of stars.
    const observer = new ResizeObserver(fill);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // The far layer is fixed to the viewport and shifted as the page scrolls, so it travels at a
  // fraction of the page's speed. The shift is taken modulo the tile: the pattern repeats exactly
  // there, so the wrap is invisible and the offset never grows past one tile — no gap to cover,
  // no layer that has to be as tall as the document.
  useEffect(() => {
    const layer = far.current;
    if (!layer) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const shift = (window.scrollY * PARALLAX) % TILE_ALT;
        layer.style.transform = `translate3d(0, ${-shift}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let id = 0;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(
        () => {
          // A hidden tab would otherwise queue up a night's worth of them and play them all at once.
          if (!document.hidden) setShots((current) => [...current, shot(id++)]);
          next();
        },
        SHOT_MIN_MS + Math.random() * SHOT_SPREAD_MS,
      );
    };
    next();
    return () => clearTimeout(timer);
  }, []);

  const done = useCallback((id: number) => {
    setShots((current) => current.filter((s) => s.id !== id));
  }, []);

  return (
    <>
      <div className="sky-far" aria-hidden="true">
        <div className="sky-far-inner" ref={far} />
      </div>
      <div className="sky" ref={ref} aria-hidden="true">
        {stars.map((star) => (
          <span
            key={star.id}
            className={`twinkle${star.gold ? ' twinkle-gold' : ''}`}
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>
      {/* Fixed rather than document-tall: a shooting star belongs to the screen you are looking
          at, and this way it needs no scroll arithmetic to land in view. */}
      <div className="shooting" aria-hidden="true">
        {shots.map((s) => (
          <span
            key={s.id}
            className="shot"
            onAnimationEnd={() => done(s.id)}
            style={
              {
                top: s.top,
                left: s.left,
                width: `${s.length}px`,
                '--angle': `${s.angle}deg`,
                '--travel': `${s.length * 2.4}px`,
                animationDuration: `${s.duration}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </>
  );
}
