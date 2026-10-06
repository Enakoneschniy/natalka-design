/** The worker's own gate, run on every request before the Next app (see `worker.ts`).
 *
 * Plain functions over a `Request`, so they are tested without a build: how large a body may be,
 * which host serves which paths, where the API is closed, how often one address may call the
 * routes that cost money or send mail, and the headers every answer leaves with.
 *
 * Relative imports only: wrangler bundles the entry without the app's path aliases.
 */

import { isProHost } from './pro/host';
import { isClosedCountry } from './region';

/** A Workers Rate Limiting binding (wrangler.jsonc `ratelimits`). */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface EdgeEnv {
  PRO_HOSTS?: string;
  RL_AUTH?: Limiter;
  RL_ORDERS?: Limiter;
  RL_PREVIEW?: Limiter;
  RL_SUBSCRIPTIONS?: Limiter;
  RL_CITIES?: Limiter;
  RL_PRO?: Limiter;
}

/** Every JSON the site and the cabinet send is a few kilobytes; a reading's facts are the
 * largest at a few dozen. */
export const MAX_BODY_BYTES = 64 * 1024;
/** A logo or photo: the cabinet's own limit is 1 MiB, with room for the request around it. */
export const MAX_IMAGE_BODY_BYTES = Math.round(1.1 * 1024 * 1024);

const IMAGE_UPLOAD = /^\/api\/pro\/x\/brand\/(logo|photo)$/;

/** The pathname as the app will route it: percent-decoded once, runs of slashes collapsed, no
 * trailing slash. Every rule below reads this form, so an escaped or doubled path cannot slip
 * past one. */
export function normalizePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A broken escape stays as it came; the app will not route it either.
  }
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

const isApi = (path: string) => path === '/api' || path.startsWith('/api/');
const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

function refuse(status: number, error: string, api: boolean): Response {
  const headers = { 'cache-control': 'no-store' };
  return api
    ? Response.json({ error }, { status, headers })
    : new Response(error, {
        status,
        headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
      });
}

/** The size of a body must be known before anything reads it. A body that does not say how long
 * it is (chunked), or a POST/PUT/PATCH without a length, is refused; a DELETE or OPTIONS without
 * one carries nothing — `fetch` sends no length for a bodiless DELETE. */
function bodyRefusal(request: Request, path: string): Response | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return null;
  const api = isApi(path);
  const declared = request.headers.get('content-length');
  if (declared === null) {
    const carriesBody =
      request.headers.has('transfer-encoding') ||
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH';
    return carriesBody ? refuse(411, 'length', api) : null;
  }
  if (!/^\d+$/.test(declared.trim())) return refuse(411, 'length', api);
  const cap = IMAGE_UPLOAD.test(path) ? MAX_IMAGE_BODY_BYTES : MAX_BODY_BYTES;
  return Number(declared) > cap ? refuse(413, 'too large', api) : null;
}

/** The files the cabinet host may serve besides the build: the icons and robots. */
const PRO_FILES = new Set(['/icon.svg', '/apple-icon.png', '/favicon.ico', '/robots.txt']);

/** The shop and the cabinet share one worker; each host answers only for its own tree. */
function hostRefusal(path: string, pro: boolean): Response | null {
  if (!pro) {
    return under(path, '/pro') || under(path, '/api/pro')
      ? refuse(404, 'not found', isApi(path))
      : null;
  }
  if (isApi(path)) {
    return under(path, '/api/pro') || path === '/api/cities'
      ? null
      : refuse(404, 'not found', true);
  }
  if (path.includes('.') && !path.startsWith('/_next/') && !PRO_FILES.has(path)) {
    return refuse(404, 'not found', false);
  }
  return null;
}

export type RateGroup = 'auth' | 'orders' | 'preview' | 'subscriptions' | 'cities' | 'pro';

const BINDING: Record<RateGroup, keyof EdgeEnv> = {
  auth: 'RL_AUTH',
  orders: 'RL_ORDERS',
  preview: 'RL_PREVIEW',
  subscriptions: 'RL_SUBSCRIPTIONS',
  cities: 'RL_CITIES',
  pro: 'RL_PRO',
};

/** Which limit a call counts against: the routes that send mail, start a payment, call the model
 * or write for a seller. Reads are free, but for city search, which is typed letter by letter. */
export function rateGroup(method: string, path: string): RateGroup | null {
  if (path === '/api/cities') return 'cities';
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD') return null;
  if (/^\/api\/pro\/(login|signup|session)$/.test(path)) return 'auth';
  if (path === '/api/orders' || /^\/api\/jobs\/[^/]+\/checkout$/.test(path)) return 'orders';
  if (path === '/api/preview') return 'preview';
  if (path === '/api/subscriptions' || path === '/api/subscriptions/confirm') {
    return 'subscriptions';
  }
  if (path.startsWith('/api/pro/x/')) return 'pro';
  return null;
}

/** One count per address and group. A missing or failing binding lets the request through: the
 * routes behind it hold their own limits, and an outage of the limiter is not one of the site. */
async function limited(env: EdgeEnv, group: RateGroup, ip: string): Promise<boolean> {
  const binding = env[BINDING[group]] as Limiter | undefined;
  if (!binding) return false;
  try {
    const { success } = await binding.limit({ key: `${group}:${ip}` });
    return !success;
  } catch (error) {
    console.error('rate limiter failed', group, error instanceof Error ? error.message : error);
    return false;
  }
}

const CSP =
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://checkout.stripe.com";
/** A PDF opens in the browser's own viewer, which `object-src 'none'` can block. */
const CSP_PDF =
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com";

/** The headers every answer leaves with, unless the app set its own. HSTS is set for the whole
 * zone at Cloudflare, not here. */
export function secured(response: Response, { pro }: { pro: boolean }): Response {
  // An upgraded connection carries no headers to add.
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  const pdf = (out.headers.get('content-type') ?? '').toLowerCase().startsWith('application/pdf');
  const wanted: [string, string][] = [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['content-security-policy', pdf ? CSP_PDF : CSP],
    ['referrer-policy', pro ? 'no-referrer' : 'strict-origin-when-cross-origin'],
    ['permissions-policy', 'camera=(), microphone=(), geolocation=()'],
  ];
  for (const [name, value] of wanted) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  return out;
}

/** Runs the checks in order — host, country, body, rate — and hands the request, untouched, to
 * the app when they pass. */
export async function gate(
  request: Request,
  env: EdgeEnv,
  next: (request: Request) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const pro = isProHost(request.headers.get('host') ?? url.host, env.PRO_HOSTS);
  const path = normalizePath(url.pathname);

  const country =
    request.headers.get('cf-ipcountry') ??
    (request as Request & { cf?: { country?: string } }).cf?.country ??
    null;
  const refusal =
    hostRefusal(path, pro) ??
    (isApi(path) && isClosedCountry(country) ? refuse(403, 'region', true) : null) ??
    bodyRefusal(request, path);
  if (refusal) return secured(refusal, { pro });

  const group = rateGroup(request.method, path);
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (group && (await limited(env, group, ip))) {
    const tooMany = Response.json(
      { error: 'too_many' },
      { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60' } },
    );
    return secured(tooMany, { pro });
  }

  return secured(await next(request), { pro });
}
