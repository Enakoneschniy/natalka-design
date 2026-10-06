import { NextResponse } from 'next/server';
import type { Accepted } from './client';
import { isProHost } from './host';

/** `/api/*` skips the middleware, so each cabinet route checks the host itself: 404 on the shop. */
export function notOnProHost(request: Request): Response | null {
  return isProHost(request.headers.get('host')) ? null : new Response(null, { status: 404 });
}

/** One IPv4 address, or an IPv6 one (which may end in an IPv4 address). */
const IP_ADDRESS = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]*:[0-9a-f:.]*)$/i;
const MAX_IP_LENGTH = 45;

/** The visitor's address as Cloudflare saw it (`cf-connecting-ip`), for the jobs worker's sign-in
 * throttle; null when it is absent or is not one address. */
export function clientIp(request: Request): string | null {
  const ip = request.headers.get('cf-connecting-ip')?.trim() ?? '';
  return ip.length <= MAX_IP_LENGTH && IP_ADDRESS.test(ip) ? ip : null;
}

/** Refuses anything a page on another site could send: a non-JSON body (a cross-site
 * `<form enctype="text/plain">` needs no preflight) and a request the browser marks as not
 * same-origin. Without `Sec-Fetch-Site` (older browsers) the `Origin` must name this host. */
export function notSameOrigin(request: Request): Response | null {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'content-type' }, { status: 415 });
  }
  return notFromThisOrigin(request);
}

/** The origin half of `notSameOrigin`, for a body that is not JSON (an image upload). */
export function notFromThisOrigin(request: Request): Response | null {
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

/** The most a logo or photo upload may be, as the jobs worker allows. */
export const MAX_IMAGE_BYTES = 1_048_576;

/** Refuses an upload that is not a PNG or JPEG (415) or that says it is over the cap (413).
 * A missing or unreadable `content-length` is refused too (411): the size must be known
 * before anything is read. */
export function notImageUpload(request: Request): Response | null {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'image/png' && type !== 'image/jpeg') {
    return NextResponse.json({ error: 'content-type' }, { status: 415 });
  }
  const raw = request.headers.get('content-length');
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return NextResponse.json({ error: 'length' }, { status: 411 });
  }
  return Number(raw) > MAX_IMAGE_BYTES ? tooLarge() : null;
}

export const tooLarge = () => NextResponse.json({ error: 'too large' }, { status: 413 });

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
