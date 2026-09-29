import { getCloudflareContext } from '@opennextjs/cloudflare';
import { type NextRequest, NextResponse } from 'next/server';

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

/** Every word a prefix, so "kyi obl" still finds "Kyiv Oblast". */
const matchExpression = (query: string): string =>
  query
    .split(/\s+/)
    .map((word) => word.replace(/["*]/g, ''))
    .filter(Boolean)
    .map((word) => `"${word}"*`)
    .join(' ');

/** Autocomplete for the birth-place field, straight out of D1.
 *
 * This is the first thing a visitor types, and it has to feel instant: the query is a few
 * milliseconds and the round trip is the only cost left.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ cities: [] });

  const expression = matchExpression(query);
  if (!expression) return NextResponse.json({ cities: [] });

  const { env } = getCloudflareContext();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.country, c.admin1 AS region, c.latitude, c.longitude, c.zone,
            c.population
     FROM city_fts f JOIN city c ON c.id = f.rowid
     WHERE city_fts MATCH ?
     ORDER BY (lower(c.name) = lower(?)) DESC, c.population DESC
     LIMIT 8`,
  )
    .bind(expression, query)
    .all<City>();

  return NextResponse.json(
    { cities: results ?? [] },
    { headers: { 'cache-control': 'public, max-age=600' } },
  );
}
