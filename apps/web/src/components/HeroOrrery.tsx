'use client';

import { useEffect, useRef } from 'react';
import { PLANET_PATHS, SIGN_KEYS, SIGN_PATHS } from '@/lib/glyphs';

/* An orrery that loops without a seam.
 *
 * Every motion here is a whole number of turns per LOOP seconds: the zodiac ring makes one, the
 * dashed ring two the other way, each planet an integer count of orbits, the Sun a fixed number of
 * breaths. So at t = LOOP the picture is exactly the picture at t = 0, and the loop closes without
 * a cut. The aspect lines follow from the positions, so they close with them.
 *
 * One requestAnimationFrame drives it all rather than CSS animations: a dozen CSS clocks started
 * on different frames drift apart, and the lines between planets need the positions anyway. Each
 * frame writes ~20 attributes on a static SVG — no React render, no layout. */

const LOOP = 120;
const SIZE = 640;
const C = SIZE / 2;

interface Planet {
  key: string;
  radius: number;
  /** Orbits per loop. Whole numbers only — that is what makes the loop seamless. */
  turns: number;
  /** Degrees at t = 0. */
  start: number;
  colour: string;
  dot: number;
}

const PLANETS: Planet[] = [
  { key: 'mercury', radius: 86, turns: 6, start: 40, colour: '#b7c6ff', dot: 5.5 },
  { key: 'venus', radius: 130, turns: 4, start: 150, colour: '#ffd9a3', dot: 7 },
  { key: 'earth', radius: 174, turns: 2, start: 250, colour: '#8ccfff', dot: 7.5 },
  { key: 'mars', radius: 218, turns: 1, start: 335, colour: '#ff8e74', dot: 6.5 },
];
const MOON = { radius: 19, turns: 18, dot: 2.6 };
const TRAIL_DEGREES = 22;
const SUN_BREATHS = 10;

/** Aspect angles and the colour their line takes. Orb is generous: the lines are the show. */
const ASPECTS: { angle: number; colour: string }[] = [
  { angle: 0, colour: 'var(--color-astro)' },
  { angle: 60, colour: 'var(--color-harmonic)' },
  { angle: 90, colour: 'var(--color-tense)' },
  { angle: 120, colour: 'var(--color-harmonic)' },
  { angle: 180, colour: 'var(--color-tense)' },
];
const ORB = 7;

const PAIRS: [number, number][] = [];
for (let a = 0; a < PLANETS.length; a++) {
  for (let b = a + 1; b < PLANETS.length; b++) PAIRS.push([a, b]);
}

const RAD = Math.PI / 180;
const point = (deg: number, r: number): [number, number] => [
  C + r * Math.cos(deg * RAD),
  C - r * Math.sin(deg * RAD),
];

/** The arc a planet leaves behind it, drawn back from where it is. */
function trail(deg: number, r: number): string {
  const [x0, y0] = point(deg - TRAIL_DEGREES, r);
  const [x1, y1] = point(deg, r);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 0 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function Glyph({ path, size, x, y }: { path: string; size: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function HeroOrrery() {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const q = <T extends Element>(selector: string) => svg.querySelector<T>(selector);
    const zodiac = q<SVGGElement>('[data-part="zodiac"]');
    const dashed = q<SVGGElement>('[data-part="dashed"]');
    const sun = q<SVGGElement>('[data-part="sun"]');
    const moon = q<SVGGElement>('[data-part="moon"]');
    const groups = PLANETS.map((p) => q<SVGGElement>(`[data-planet="${p.key}"]`));
    const trails = PLANETS.map((p) => q<SVGPathElement>(`[data-trail="${p.key}"]`));
    const lines = PAIRS.map((_, i) => q<SVGLineElement>(`[data-aspect="${i}"]`));

    const frame = (t: number) => {
      const u = (t % LOOP) / LOOP;
      zodiac?.setAttribute('transform', `rotate(${(u * 360).toFixed(3)} ${C} ${C})`);
      dashed?.setAttribute('transform', `rotate(${(-u * 720).toFixed(3)} ${C} ${C})`);

      const angles: number[] = [];
      const points: [number, number][] = [];
      PLANETS.forEach((p, i) => {
        const deg = p.start + 360 * p.turns * u;
        const [x, y] = point(deg, p.radius);
        angles.push(deg);
        points.push([x, y]);
        groups[i]?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        trails[i]?.setAttribute('d', trail(deg, p.radius));
        if (p.key === 'earth' && moon) {
          const m = 360 * MOON.turns * u;
          const mx = x + MOON.radius * Math.cos(m * RAD);
          const my = y - MOON.radius * Math.sin(m * RAD);
          moon.setAttribute('transform', `translate(${mx.toFixed(2)} ${my.toFixed(2)})`);
        }
      });

      PAIRS.forEach(([a, b], i) => {
        const line = lines[i];
        if (!line) return;
        const separation = Math.abs((((angles[a] ?? 0) - (angles[b] ?? 0) + 540) % 360) - 180);
        let best: { strength: number; colour: string } | null = null;
        for (const aspect of ASPECTS) {
          const off = Math.abs(separation - aspect.angle);
          if (off < ORB && (!best || 1 - off / ORB > best.strength)) {
            best = { strength: 1 - off / ORB, colour: aspect.colour };
          }
        }
        if (!best) {
          line.setAttribute('opacity', '0');
          return;
        }
        const [x1, y1] = points[a] ?? [C, C];
        const [x2, y2] = points[b] ?? [C, C];
        line.setAttribute('x1', x1.toFixed(2));
        line.setAttribute('y1', y1.toFixed(2));
        line.setAttribute('x2', x2.toFixed(2));
        line.setAttribute('y2', y2.toFixed(2));
        line.setAttribute('stroke', best.colour);
        // Eased so a line arrives softly rather than switching on at the edge of the orb.
        line.setAttribute('opacity', (best.strength * best.strength * 0.85).toFixed(3));
      });

      const breath = 1 + 0.05 * Math.sin(2 * Math.PI * SUN_BREATHS * u);
      sun?.setAttribute('transform', `translate(${C} ${C}) scale(${breath.toFixed(4)})`);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      frame(0);
      return;
    }

    let handle = 0;
    let running = false;
    const t0 = performance.now();
    const tick = (now: number) => {
      frame((now - t0) / 1000);
      handle = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      handle = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(handle);
    };
    // Nothing turns while the hero is scrolled out of sight — the page below it should not pay
    // for an animation nobody is looking at.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) start();
      else stop();
    });
    observer.observe(svg);
    frame(0);
    return () => {
      observer.disconnect();
      stop();
    };
  }, []);

  return (
    <div className="wheel-glow orrery">
      <svg ref={root} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="orrery-sun">
            <stop offset="0%" stopColor="#fff3d6" />
            <stop offset="45%" stopColor="#f0b95b" />
            <stop offset="100%" stopColor="#d6973a" />
          </radialGradient>
          <radialGradient id="orrery-sun-halo">
            <stop offset="0%" stopColor="rgba(240, 185, 91, 0.55)" />
            <stop offset="55%" stopColor="rgba(240, 185, 91, 0.12)" />
            <stop offset="100%" stopColor="rgba(240, 185, 91, 0)" />
          </radialGradient>
          <radialGradient id="orrery-planet-halo">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.55)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>
        </defs>

        {/* zodiac ring: twelve sectors, their glyphs, and the degree ticks */}
        <g data-part="zodiac" className="orrery-zodiac">
          <circle cx={C} cy={C} r={300} fill="none" />
          <circle cx={C} cy={C} r={274} fill="none" />
          {Array.from({ length: 36 }, (_, i) => {
            const deg = i * 10;
            const major = i % 3 === 0;
            const [x0, y0] = point(deg, major ? 274 : 282);
            const [x1, y1] = point(deg, 300);
            return (
              <line
                key={deg}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                className={major ? 'orrery-tick-major' : 'orrery-tick'}
              />
            );
          })}
          {SIGN_KEYS.map((key, i) => {
            const deg = 180 - 15 - i * 30;
            const [x, y] = point(deg, 287);
            return (
              <g key={key} className="orrery-sign">
                <Glyph path={SIGN_PATHS[key]} size={18} x={x} y={y} />
              </g>
            );
          })}
        </g>

        <g data-part="dashed">
          <circle cx={C} cy={C} r={252} className="orrery-dashed" fill="none" />
        </g>

        {/* orbits */}
        {PLANETS.map((p) => (
          <circle key={p.key} cx={C} cy={C} r={p.radius} className="orrery-orbit" fill="none" />
        ))}

        {/* aspect lines, one per pair, hidden until an aspect forms */}
        {PAIRS.map((pair, i) => (
          <line
            key={pair.join('-')}
            data-aspect={i}
            className="orrery-aspect"
            x1={C}
            y1={C}
            x2={C}
            y2={C}
            opacity="0"
          />
        ))}

        {/* the Sun */}
        <g data-part="sun">
          <circle r={86} fill="url(#orrery-sun-halo)" />
          <circle r={20} fill="url(#orrery-sun)" />
        </g>

        {/* trails then planets, so a planet is drawn over its own trail */}
        {PLANETS.map((p) => (
          <path
            key={p.key}
            data-trail={p.key}
            className="orrery-trail"
            stroke={p.colour}
            fill="none"
            d=""
          />
        ))}
        {PLANETS.map((p) => (
          <g key={p.key} data-planet={p.key} className="orrery-planet" style={{ color: p.colour }}>
            <circle r={p.dot * 3} fill="url(#orrery-planet-halo)" opacity="0.4" />
            <circle r={p.dot} fill={p.colour} />
            <Glyph path={PLANET_PATHS[p.key] ?? ''} size={18} x={0} y={-p.dot - 14} />
          </g>
        ))}
        <g data-part="moon" className="orrery-moon">
          <circle r={MOON.dot} fill="#e8ecff" />
        </g>
      </svg>
    </div>
  );
}
