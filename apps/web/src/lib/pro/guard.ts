import { NextResponse } from 'next/server';
import type { Accepted } from './client';
import { isProHost } from './host';

/** `/api/*` skips the middleware, so each cabinet route checks the host itself: 404 on the shop. */
export function notOnProHost(request: Request): Response | null {
  return isProHost(request.headers.get('host')) ? null : new Response(null, { status: 404 });
}

/** The request's JSON object, or null when the body is not one. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503 });

/** The jobs worker's answer for the browser: 202 as is, a validation 400 with its reason, and
 * anything else (an outage, a status it never sends) as 503. */
export async function relay(call: () => Promise<Accepted>): Promise<Response> {
  let result: Accepted;
  try {
    result = await call();
  } catch {
    return unavailable();
  }
  if (result.ok) return NextResponse.json({ ok: true }, { status: 202 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  return unavailable();
}
