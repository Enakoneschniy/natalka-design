/** Types and geometry for the natal wheel.
 *
 * `ChartFacts` mirrors `natalka_engine.serialize.chart_to_dict` — the engine is the only place that
 * computes astronomy, the front end just draws what it is given.
 */

export type BodyKey = string;

export interface Position {
  body: BodyKey;
  sign: string;
  longitude: number;
  degree: string;
  degree_in_sign: number;
  house: number | null;
  retrograde: boolean | null;
  speed: number;
  latitude: number;
}

export interface AspectFact {
  a: BodyKey;
  b: BodyKey;
  type: string;
  nature: 'tense' | 'harmonious' | 'neutral';
  orb: number;
  applying: boolean | null;
  strength: number;
}

export interface Cusp {
  house: number;
  longitude: number;
  sign: string;
  degree: string;
}

export interface ChartFacts {
  schema_version: number;
  birth: {
    date: string;
    time: string | null;
    unknown_time: boolean;
    zone: string;
    utc: string;
    utc_offset: string;
    latitude: number;
    longitude: number;
    julian_day: number;
  };
  day_chart: boolean | null;
  positions: Position[];
  houses: {
    system: string;
    cusps: Cusp[];
    asc: number;
    mc: number;
    vertex: number;
  } | null;
  aspects: AspectFact[];
  analysis: Record<string, unknown>;
  warnings: string[];
}

export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Smallest signed distance from `a` to `b`, in (-180, 180]. */
export const delta = (a: number, b: number): number => {
  const d = (((b - a + 180) % 360) + 360) % 360;
  return d - 180 === -180 ? 180 : d - 180;
};

export const formatDegree = (longitude: number): string => {
  const within = longitude % 30;
  let d = Math.floor(within);
  let m = Math.round((within - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  return `${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′`;
};

export const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const;

export const ANGLE_LABELS: Record<number, string> = { 0: 'AC', 3: 'IC', 6: 'DC', 9: 'MC' };

export const MAJOR_ASPECTS = new Set(['conjunction', 'opposition', 'trine', 'square', 'sextile']);

/** Spread overlapping planet glyphs apart while keeping the pointer at the true degree. */
export function spreadPlanets(
  items: { body: BodyKey; lon: number }[],
  asc: number,
  minSep: number,
): { body: BodyKey; lon: number; display: number; level: number }[] {
  const sorted = items
    .map((p) => ({ ...p, display: p.lon, level: 0 }))
    .sort((a, b) => norm360(a.lon - asc) - norm360(b.lon - asc));
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      const gap = norm360(cur.display - prev.display);
      if (gap < minSep) {
        const push = (minSep - gap) / 2;
        prev.display = norm360(prev.display - push);
        cur.display = norm360(cur.display + push);
      }
    }
  }
  sorted.forEach((p, i) => {
    const prev = i ? sorted[i - 1] : undefined;
    p.level = prev && norm360(p.display - prev.display) < 14 ? (prev.level + 1) % 2 : 0;
  });
  return sorted;
}
