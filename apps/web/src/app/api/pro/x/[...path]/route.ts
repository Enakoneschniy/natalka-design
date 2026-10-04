import { NextResponse } from 'next/server';
import { matchProxy, type ProxyMatch } from '@/lib/pro/allow';
import { proForward } from '@/lib/pro/client';
import {
  MAX_IMAGE_BYTES,
  notFromThisOrigin,
  notImageUpload,
  notOnProHost,
  notSameOrigin,
  tooLarge,
  unavailable,
} from '@/lib/pro/guard';
import { sessionFrom } from '@/lib/pro/session';

/** The cabinet's one door to the jobs worker for calls made from the browser.
 *
 * Only the method and path pairs in `lib/pro/allow.ts` pass; the key and the session stay on
 * this server. Mutations must come from the cabinet's own pages (and, but for an image upload,
 * carry JSON), so a page on another site cannot spend credits or delete clients. */

type Context = { params: Promise<{ path: string[] }> };

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });
const signedOut = () => NextResponse.json({ error: 'signed out' }, { status: 401 });

/** A file is opened by a link, not by the cabinet's scripts: a JSON 401 would be saved as the
 * download. Sign-in comes instead, saying why; a relative Location keeps the host. */
const signInForFile = () =>
  new Response(null, {
    status: 303,
    headers: { location: '/login?expired=1', 'cache-control': 'no-store' },
  });

const isFile = (match: ProxyMatch) => match.kind === 'pdf' || match.kind === 'image';

async function proxy(request: Request, { params }: Context): Promise<Response> {
  const blocked = notOnProHost(request);
  if (blocked) return blocked;

  const match = matchProxy(request.method, (await params).path ?? []);
  if (!match) return notFound();

  const mutation = request.method !== 'GET';
  if (mutation) {
    const refused =
      match.kind === 'image-upload'
        ? (notFromThisOrigin(request) ?? notImageUpload(request))
        : notSameOrigin(request);
    if (refused) return refused;
  }

  const session = sessionFrom(request);
  if (!session) return isFile(match) ? signInForFile() : signedOut();

  const body = await bodyOf(request, match);
  if (body instanceof Response) return body;

  let upstream: Response;
  try {
    const query = mutation ? '' : new URL(request.url).search;
    upstream = await proForward(`/v1/pro/${match.path}${query}`, {
      method: request.method,
      session,
      ...body,
    });
  } catch {
    return unavailable();
  }
  // Redirects are not followed (`proForward`), and jobs has none to give: one is an outage.
  if (upstream.type === 'opaqueredirect' || (upstream.status >= 300 && upstream.status < 400))
    return unavailable();
  if (upstream.status === 401) return isFile(match) ? signInForFile() : signedOut();
  if (isFile(match) && upstream.ok) return stream(upstream);
  return relayJson(upstream);
}

/** What to send on: nothing for GET and DELETE, the JSON text, or the image bytes — read in
 * full and measured, since a `content-length` is only a claim. */
async function bodyOf(
  request: Request,
  match: ProxyMatch,
): Promise<{ body?: BodyInit; contentType?: string } | Response> {
  if (request.method === 'GET' || request.method === 'DELETE') return {};
  if (match.kind === 'image-upload') {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return tooLarge();
    const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    return { body: bytes, contentType };
  }
  return { body: await request.text(), contentType: 'application/json' };
}

function stream(upstream: Response): Response {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  const type = upstream.headers.get('content-type');
  if (type) headers.set('content-type', type);
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) headers.set('content-disposition', disposition);
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** The jobs answer as is; a body that is not JSON (an outage page) becomes 503. */
async function relayJson(upstream: Response): Promise<Response> {
  const data: unknown = await upstream.json().catch(() => undefined);
  if (data === undefined) return unavailable();
  return NextResponse.json(data, {
    status: upstream.status,
    headers: { 'cache-control': 'private, no-store' },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
