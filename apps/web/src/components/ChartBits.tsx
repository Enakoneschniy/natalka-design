import { useTranslations } from 'next-intl';
import { type ChartFacts, formatDegree, norm360 } from '@/lib/chart';
import { ASPECT_BODIES, ASPECT_PATHS, PLANET_PATHS, SIGN_KEYS, SIGN_PATHS } from '@/lib/glyphs';

const ELEMENTS = ['fire', 'earth', 'air', 'water'] as const;

const HIDDEN_IN_TABLE = new Set(['dsc', 'ic', 'vertex']);

export const signOf = (longitude: number) =>
  SIGN_KEYS[Math.floor(norm360(longitude) / 30)] ?? 'aries';

const elementOf = (longitude: number) =>
  ELEMENTS[Math.floor(norm360(longitude) / 30) % 4] ?? 'fire';

function Glyph({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d={path} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ANGLE_MARKS: Record<string, string> = { asc: 'AC', mc: 'MC', dsc: 'DC', ic: 'IC' };

/** Glyph for a body, or its two-letter mark for the angles, which have no glyph. */
function BodyMark({ body }: { body: string }) {
  const path = PLANET_PATHS[body];
  if (path) return <Glyph path={path} />;
  return (
    <span className="angle-mark mono">{ANGLE_MARKS[body] ?? body.slice(0, 2).toUpperCase()}</span>
  );
}

/** "Sun in Taurus 24°24′" — the header markers above the wheel. */
export function ChartBadge({
  body,
  longitude,
  withDegree = false,
  astro = false,
}: {
  body: string;
  longitude: number;
  withDegree?: boolean;
  astro?: boolean;
}) {
  const t = useTranslations('chart');
  const sign = signOf(longitude);
  const planetPath = PLANET_PATHS[body];
  return (
    <span className={`badge ${elementOf(longitude)}${astro ? ' astro' : ''}`}>
      {planetPath ? (
        <span className="glyph">
          <Glyph path={planetPath} />
        </span>
      ) : null}
      <span className="sign">
        <Glyph path={SIGN_PATHS[sign]} />
      </span>
      {`${t(`planets.${body}`)} ${t(`in.${sign}`)}`}
      {withDegree ? <span className="deg">{formatDegree(longitude)}</span> : null}
    </span>
  );
}

export function PositionsTable({ facts }: { facts: ChartFacts }) {
  const t = useTranslations('chart');
  // The engine returns the angles among the positions; DSC and IC are the opposite points of
  // ASC and MC and the Vertex is a specialist's point — none of them earn a row in a preview.
  const rows = facts.positions.filter((p) => !HIDDEN_IN_TABLE.has(p.body));
  return (
    <table className="positions">
      <thead>
        <tr>
          <th>{t('table.planet')}</th>
          <th>{t('table.sign')}</th>
          <th>{t('table.degree')}</th>
          <th className="num">{t('table.house')}</th>
          <th className="num">{t('table.retro')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const sign = signOf(row.longitude);
          return (
            <tr key={row.body} className={elementOf(row.longitude)}>
              <td>
                <span className="pl">
                  <BodyMark body={row.body} />
                  {t(`planets.${row.body}`)}
                </span>
              </td>
              <td>
                <span className="sg">
                  <Glyph path={SIGN_PATHS[sign]} />
                  {t(`signs.${sign}`)}
                </span>
              </td>
              <td className="mono">{formatDegree(row.longitude)}</td>
              <td className="mono num">{row.house ?? '—'}</td>
              <td className="num">{row.retrograde ? <span className="r">R</span> : null}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const LEGEND = [
  { type: 'conjunction', nature: 'neutral' },
  { type: 'trine', nature: 'harmonious' },
  { type: 'sextile', nature: 'harmonious' },
  { type: 'square', nature: 'tense' },
  { type: 'opposition', nature: 'tense' },
] as const;

export function AspectLegend() {
  const t = useTranslations('preview.legend');
  return (
    <ul className="aspect-legend">
      {LEGEND.map(({ type, nature }) => (
        <li key={type}>
          <i className={nature}>
            <Glyph path={ASPECT_PATHS[type] ?? ''} />
          </i>
          {t(type)}
        </li>
      ))}
    </ul>
  );
}

/** Classic lower-triangle aspect grid: every pair of bodies that form an aspect. */
export function AspectGrid({ facts }: { facts: ChartFacts }) {
  const t = useTranslations('chart');
  const bodies = facts.positions.map((p) => p.body).filter((body) => ASPECT_BODIES.has(body));

  const find = (a: string, b: string) =>
    facts.aspects.find(
      (aspect) =>
        ((aspect.a === a && aspect.b === b) || (aspect.a === b && aspect.b === a)) &&
        ASPECT_PATHS[aspect.type],
    );

  return (
    <table className="aspects" aria-label={t('table.planet')}>
      <tbody>
        {bodies.slice(1).map((body, i) => (
          <tr key={body}>
            <th title={t(`planets.${body}`)}>
              <BodyMark body={body} />
            </th>
            {bodies.slice(0, i + 1).map((other) => {
              const aspect = find(body, other);
              const path = aspect ? ASPECT_PATHS[aspect.type] : undefined;
              return (
                <td
                  key={other}
                  className={aspect?.nature ?? ''}
                  title={
                    aspect
                      ? `${t(`planets.${body}`)} — ${t(`planets.${other}`)}: ${t(`aspects.${aspect.type}`)}`
                      : undefined
                  }
                >
                  {path ? <Glyph path={path} /> : null}
                </td>
              );
            })}
          </tr>
        ))}
        <tr>
          <th />
          {bodies.slice(0, -1).map((body) => (
            <th key={body} title={t(`planets.${body}`)}>
              <BodyMark body={body} />
            </th>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
