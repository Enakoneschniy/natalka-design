import { getCloudflareContext } from '@opennextjs/cloudflare';
import { type NextRequest, NextResponse } from 'next/server';
import { cityQuery } from '@/lib/cities';

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

/** Autocomplete for the birth-place field, straight out of D1.
 *
 * This is the first thing a visitor types, and it has to feel instant: the query is a few
 * milliseconds and the round trip is the only cost left.
 */
export async function GET(request: NextRequest) {
  const query = cityQuery(request.nextUrl.searchParams.get('q'));
  if (!query) return NextResponse.json({ cities: [] });

  const { env } = getCloudflareContext();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.country, c.admin1 AS region, c.latitude, c.longitude, c.zone,
            c.population
     FROM city_fts f JOIN city c ON c.id = f.rowid
     WHERE city_fts MATCH ?
     ORDER BY (lower(c.name) = lower(?)) DESC, c.population DESC
     LIMIT 8`,
  )
    .bind(query.match, query.name)
    .all<City>();

  return NextResponse.json(
    { cities: results ?? [] },
    { headers: { 'cache-control': 'public, max-age=600' } },
  );
}
