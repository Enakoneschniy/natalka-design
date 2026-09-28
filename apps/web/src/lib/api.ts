/** Server-side client for the calculation API (the Python engine in a Cloudflare Container).
 *
 * The API is not public: every call goes through a route handler or a server component, so the
 * browser never learns its address and we can cache on our side.
 */

import type { ChartFacts } from './chart';

export interface City {
  id: number;
  name: string;
  country: string;
  region: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  population: number;
}

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
  const url = process.env.NATALKA_API_URL;
  if (!url) throw new Error('NATALKA_API_URL is not configured');
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

export const searchCities = (query: string, limit = 8): Promise<{ cities: City[] }> =>
  call(`/v1/cities?q=${encodeURIComponent(query)}&limit=${limit}`, {
    // Birth places do not change; a day of edge caching keeps the container asleep.
    cf: { cacheTtl: 86400, cacheEverything: true },
  } as RequestInit);

export const calcChart = (input: BirthInput): Promise<ChartFacts> =>
  call('/v1/calc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
