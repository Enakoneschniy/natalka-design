import { NextResponse } from 'next/server';
import type { Accepted } from './client';
import { isProHost } from './host';

/** `/api/*` skips the middleware, so each cabinet route checks the host itself: 404 on the shop. */
export function notOnProHost(request: Request): Response | null {
  return isProHost(request.headers.get('host')) ? null : new Response(null, { status: 404 });
}

/** Refuses anything a page on another site could send: a non-JSON body (a cross-site
 * `<form enctype="text/plain">` needs no preflight) and a request the browser marks as not
 * same-origin. Without `Sec-Fetch-Site` (older browsers) the `Origin` must name this host. */
export function notSameOrigin(request: Request): Response | null {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'content-type' }, { status: 415 });
  }
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin' ? null : forbidden();
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return forbidden();
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase() ? null : forbidden();
  } catch {
    return forbidden();
  }
}

const forbidden = () => NextResponse.json({ error: 'origin' }, { status: 403 });

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
