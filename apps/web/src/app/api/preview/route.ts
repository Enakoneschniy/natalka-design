import { type NextRequest, NextResponse } from 'next/server';

/** The free preview passages. Proxied so the jobs Worker address stays private. */
export async function POST(request: NextRequest) {
  const base = process.env.NATALKA_JOBS_URL;
  if (!base) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const upstream = await fetch(`${base.replace(/\/$/, '')}/v1/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(await request.json()),
  });
  if (!upstream.ok) {
    return NextResponse.json({ error: 'preview unavailable' }, { status: upstream.status });
  }
  return NextResponse.json(await upstream.json(), {
    headers: { 'cache-control': 'private, max-age=600' },
  });
}
