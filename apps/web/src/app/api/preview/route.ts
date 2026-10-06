import { type NextRequest, NextResponse } from 'next/server';
import { fetchPreview } from '@/lib/jobs';
import { unavailable } from '@/lib/route';

/** The free preview passages. Proxied so the jobs Worker address stays private. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  let upstream: Response;
  try {
    upstream = await fetchPreview(body);
  } catch (error) {
    return unavailable('preview failed', error);
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: 'preview unavailable' }, { status: upstream.status });
  }
  return NextResponse.json(await upstream.json(), {
    headers: { 'cache-control': 'private, max-age=600' },
  });
}
