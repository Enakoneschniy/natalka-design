/** Server-side client for the ephemeris service — a public, AGPL program of its own
 * (github.com/Enakoneschniy/ephemeris-service) that this product calls over HTTP.
 *
 * Calls go through a route handler or a server component, so a chart is computed once per render
 * and the browser never issues them itself.
 */

import type { ChartFacts } from './chart';

export interface BirthInput {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const base = (): string => {
  const url = process.env.EPHEMERIS_API_URL;
  if (!url) throw new Error('EPHEMERIS_API_URL is not configured');
  return url.replace(/\/$/, '');
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base()}${path}`, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ApiError(response.status, detail.slice(0, 200) || response.statusText);
  }
  return (await response.json()) as T;
}

export const calcChart = (input: BirthInput): Promise<ChartFacts> =>
  call('/v1/calc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

export interface SynastryFacts {
  schema_version: number;
  first: ChartFacts;
  second: ChartFacts;
  cross_aspects: {
    a: string;
    b: string;
    type: string;
    nature: 'tense' | 'harmonious' | 'neutral';
    orb: number;
    strength: number;
    major: boolean;
  }[];
  overlay: {
    second_in_first_houses: Record<string, number>;
    first_in_second_houses: Record<string, number>;
  };
}

/** Two charts and what they do to each other. */
export const calcSynastry = (first: BirthInput, second: BirthInput): Promise<SynastryFacts> =>
  call('/v1/synastry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ first, second }),
  });

export interface TransitEvent {
  kind: string;
  body: string;
  target?: string;
  aspect?: string;
  sign?: string;
  date: string;
}

/** The exact transits to a chart in a window. The horoscope and the document use the same call. */
export const calcTransits = (body: {
  longitudes: Record<string, number>;
  start: string;
  end: string;
  bodies?: string[];
  targets?: string[];
  ingresses?: boolean;
}): Promise<{ events: TransitEvent[] }> =>
  call('/v1/transits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
