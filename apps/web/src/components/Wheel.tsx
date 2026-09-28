'use client';

import { useId, useMemo, useState } from 'react';
import {
  ANGLE_LABELS,
  type ChartFacts,
  delta,
  formatDegree,
  MAJOR_ASPECTS,
  norm360,
  ROMAN,
  spreadPlanets,
} from '@/lib/chart';
import { ASPECT_BODIES, PLANET_PATHS, SIGN_KEYS, SIGN_PATHS, WHEEL_BODIES } from '@/lib/glyphs';

type Detail = 'full' | 'compact' | 'mark';

interface Props {
  facts: ChartFacts;
  size?: number;
  detail?: Detail;
  highlight?: string | null;
  /** Interactive hover: dim everything except the focused planet and its aspects. */
  interactive?: boolean;
  /** Animate the chart drawing itself on mount. */
  animate?: boolean;
  onFocusBody?: (body: string | null) => void;
  focusedBody?: string | null;
  className?: string;
}

const VAR = (name: string) => `var(--wheel-${name})`;

export function Wheel({
  facts,
  size = 640,
  detail = 'full',
  highlight = null,
  interactive = true,
  animate = false,
  onFocusBody,
  focusedBody,
  className,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = focusedBody !== undefined ? focusedBody : hovered;

  const geometry = useMemo(() => buildGeometry(facts, size, detail), [facts, size, detail]);
  const { radii, point, cusps, unknownTime } = geometry;

  const setFocus = (body: string | null) => {
    if (!interactive) return;
    setHovered(body);
    onFocusBody?.(body);
  };

  const planets = geometry.planets;
  const aspects = facts.aspects.filter(
    (a) =>
      MAJOR_ASPECTS.has(a.type) &&
      a.type !== 'conjunction' &&
      ASPECT_BODIES.has(a.a) &&
      ASPECT_BODIES.has(a.b),
  );
  const byBody = new Map(facts.positions.map((p) => [p.body, p]));

  const swThin = Math.max(0.6, size / 900);
  const swMid = Math.max(0.8, size / 600);
  const swStrong = Math.max(1.2, size / 400);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={['wheel', focus ? 'is-focus' : '', className].filter(Boolean).join(' ')}
      role="img"
      aria-label="Natal chart"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      data-animate={animate || undefined}
    >
      <circle
        cx={radii.c}
        cy={radii.c}
        r={radii.outer}
        fill={VAR('face')}
        stroke={VAR('line')}
        strokeWidth={swMid}
      />

      {/* zodiac ring */}
      <g className="wheel-zodiac">
        {SIGN_KEYS.map((key, i) => {
          const a0 = i * 30;
          const [xo0, yo0] = point(a0, radii.outer);
          const [xo1, yo1] = point(a0 + 30, radii.outer);
          const [xi1, yi1] = point(a0 + 30, radii.zodiacIn);
          const [xi0, yi0] = point(a0, radii.zodiacIn);
          const [dx0, dy0] = point(a0, radii.zodiacIn);
          const [dx1, dy1] = point(a0, radii.outer);
          const gs = detail === 'full' ? size * 0.042 : size * 0.055;
          const [gx, gy] = point(a0 + 15, (radii.outer + radii.zodiacIn) / 2);
          return (
            <g key={key}>
              <path
                d={`M${xo0} ${yo0}A${radii.outer} ${radii.outer} 0 0 0 ${xo1} ${yo1}L${xi1} ${yi1}A${radii.zodiacIn} ${radii.zodiacIn} 0 0 1 ${xi0} ${yi0}Z`}
                fill={VAR('sector')}
              />
              <line x1={dx0} y1={dy0} x2={dx1} y2={dy1} stroke={VAR('line')} strokeWidth={swThin} />
              <Glyph path={SIGN_PATHS[key]} size={gs} x={gx} y={gy} color={VAR('sign')} />
            </g>
          );
        })}
        <circle
          cx={radii.c}
          cy={radii.c}
          r={radii.zodiacIn}
          fill="none"
          stroke={VAR('line')}
          strokeWidth={swMid}
        />
      </g>

      {/* degree ticks */}
      <g className="wheel-ticks">
        {Array.from({ length: 360 }, (_, d) => d).map((d) => {
          const frac = d % 10 === 0 ? 1 : d % 5 === 0 ? 0.6 : 0.3;
          const [x0, y0] = point(d, radii.zodiacIn);
          const [x1, y1] = point(d, radii.zodiacIn - (radii.zodiacIn - radii.tickIn) * frac);
          return (
            <line
              key={d}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={d % 10 === 0 ? VAR('text-2') : VAR('line')}
              strokeWidth={swThin}
            />
          );
        })}
        <circle
          cx={radii.c}
          cy={radii.c}
          r={radii.tickIn}
          fill="none"
          stroke={VAR('line')}
          strokeWidth={swThin}
        />
      </g>

      {/* houses */}
      {!unknownTime && cusps && (
        <g className="wheel-houses">
          <circle
            cx={radii.c}
            cy={radii.c}
            r={radii.houseOut}
            fill={VAR('ring')}
            stroke={VAR('line')}
            strokeWidth={swMid}
          />
          <circle
            cx={radii.c}
            cy={radii.c}
            r={radii.houseIn}
            fill={VAR('face')}
            stroke={VAR('line')}
            strokeWidth={swMid}
          />
          {cusps.map((cusp, i) => {
            const isAngle = i % 3 === 0;
            const [x0, y0] = point(cusp, radii.houseIn);
            const [x1, y1] = point(cusp, isAngle ? radii.zodiacIn : radii.tickIn);
            const next = cusps[(i + 1) % 12] ?? cusp;
            const [tx, ty] = point(
              cusp + norm360(next - cusp) / 2,
              (radii.houseOut + radii.houseIn) / 2,
            );
            const [lx, ly] = point(cusp, (radii.zodiacIn + radii.tickIn) / 2);
            return (
              <g key={`cusp-${ROMAN[i]}`}>
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  stroke={isAngle ? VAR('line-strong') : VAR('line')}
                  strokeWidth={isAngle ? swStrong : swThin}
                />
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={VAR('text-2')}
                  fontFamily="var(--font-mono)"
                  fontSize={size * (detail === 'full' ? 0.021 : 0.028)}
                >
                  {ROMAN[i]}
                </text>
                {isAngle && detail === 'full' && (
                  <>
                    <rect
                      x={lx - size * 0.022}
                      y={ly - size * 0.013}
                      width={size * 0.044}
                      height={size * 0.026}
                      rx={size * 0.006}
                      fill="var(--color-surface-solid)"
                      stroke={VAR('line-strong')}
                      strokeWidth={swThin}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={VAR('line-strong')}
                      fontFamily="var(--font-mono)"
                      fontSize={size * 0.02}
                    >
                      {ANGLE_LABELS[i]}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* aspects */}
      <g className="wheel-aspects">
        {aspects.map((a) => {
          const pa = byBody.get(a.a);
          const pb = byBody.get(a.b);
          if (!pa || !pb) return null;
          const [x0, y0] = point(pa.longitude, radii.aspect);
          const [x1, y1] = point(pb.longitude, radii.aspect);
          const colour =
            a.nature === 'tense'
              ? VAR('tense')
              : a.nature === 'harmonious'
                ? VAR('harmonic')
                : VAR('neutral');
          const tight = a.orb < 2;
          const active = focus === a.a || focus === a.b;
          return (
            <line
              key={`${a.a}-${a.b}-${a.type}`}
              className={active ? 'is-active' : undefined}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={colour}
              strokeWidth={tight ? swStrong : swMid}
              strokeOpacity={tight ? 0.9 : 0.55}
            />
          );
        })}
      </g>

      {/* planets */}
      <g className="wheel-planets">
        {planets.map((p) => {
          const isSun = p.body === 'sun';
          const isHl = highlight === p.body;
          const colour = isSun || isHl ? VAR('astro') : VAR('glyph');
          const [ax, ay] = point(p.lon, radii.tickIn);
          const [gx, gy] = point(p.display, radii.planet);
          const [px, py] = point(
            p.display,
            radii.planet + size * (detail === 'full' ? 0.04 : 0.05),
          );
          const gs = detail === 'full' ? size * 0.045 : size * 0.06;
          const [tx, ty] = point(p.display, radii.planet - radii.r * (0.085 + p.level * 0.055));
          const fact = byBody.get(p.body);
          const path = PLANET_PATHS[p.body];
          if (!path) return null;
          return (
            <g
              key={p.body}
              className={`wheel-planet${isSun ? ' is-sun' : ''}${focus === p.body ? ' is-active' : ''}`}
              data-body={p.body}
              onPointerEnter={() => setFocus(p.body)}
              onPointerLeave={() => setFocus(null)}
            >
              <line
                x1={ax}
                y1={ay}
                x2={px}
                y2={py}
                stroke={isSun || isHl ? VAR('astro') : VAR('line')}
                strokeWidth={swThin}
              />
              <circle cx={ax} cy={ay} r={Math.max(1.5, size * 0.006)} fill={colour} />
              {(isSun || isHl) && (
                <circle cx={gx} cy={gy} r={gs * 0.9} fill={VAR('astro-soft')} className="halo" />
              )}
              <Glyph
                path={path}
                size={gs}
                x={gx}
                y={gy}
                color={colour}
                strokeWidth={isSun ? 2 : 1.9}
              />
              {detail === 'full' && (
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isSun || isHl ? VAR('astro') : VAR('text-2')}
                  fontFamily="var(--font-mono)"
                  fontSize={size * 0.018}
                >
                  {formatDegree(p.lon)}
                  {fact?.retrograde ? ' R' : ''}
                </text>
              )}
              {interactive && (
                <circle
                  cx={gx}
                  cy={gy}
                  r={gs * 1.15}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`${p.body} ${formatDegree(p.lon)}`}</title>
                </circle>
              )}
            </g>
          );
        })}
      </g>
      <desc>{`asc ${facts.houses ? Math.round(facts.houses.asc) : 'n/a'} ${uid}`}</desc>
    </svg>
  );
}

function Glyph({
  path,
  size,
  x,
  y,
  color,
  strokeWidth = 1.9,
}: {
  path: string;
  size: number;
  x: number;
  y: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function buildGeometry(facts: ChartFacts, size: number, detail: Detail) {
  const r = size / 2;
  const cusps = facts.houses ? facts.houses.cusps.map((c) => c.longitude) : null;
  const asc = cusps?.[0] ?? 0;
  const point = (lon: number, radius: number): [number, number] => {
    const a = (norm360(lon - asc) * Math.PI) / 180;
    return [r - radius * Math.cos(a), r + radius * Math.sin(a)];
  };
  const radii = {
    r,
    c: r,
    outer: r - 1,
    zodiacIn: r * 0.86,
    tickIn: detail === 'full' ? r * 0.8 : r * 0.82,
    planet: detail === 'full' ? r * 0.705 : r * 0.7,
    houseOut: detail === 'full' ? r * 0.53 : r * 0.54,
    houseIn: detail === 'full' ? r * 0.47 : r * 0.48,
    aspect: detail === 'full' ? r * 0.45 : r * 0.46,
  };
  const drawable = facts.positions.filter((p) =>
    (WHEEL_BODIES as readonly string[]).includes(p.body),
  );
  const planets = spreadPlanets(
    drawable.map((p) => ({ body: p.body, lon: p.longitude })),
    asc,
    detail === 'full' ? 8 : 10,
  );
  return { radii, point, cusps, asc, planets, unknownTime: cusps === null, delta };
}
