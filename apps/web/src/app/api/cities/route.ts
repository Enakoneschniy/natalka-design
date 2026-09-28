import { type NextRequest, NextResponse } from 'next/server';
import { ApiError, searchCities } from '@/lib/api';

/** Autocomplete for the birth-place field; proxies the calculation API so it stays private. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ cities: [] });
  try {
    const result = await searchCities(query);
    return NextResponse.json(result, {
      headers: { 'cache-control': 'public, max-age=600' },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return NextResponse.json({ cities: [], error: 'city search unavailable' }, { status });
  }
}
