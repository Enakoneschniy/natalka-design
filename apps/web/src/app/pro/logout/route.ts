import { NextResponse } from 'next/server';
import { logout } from '@/lib/pro/client';
import { clearSessionCookies, readSession } from '@/lib/pro/session';

/** A relative Location keeps the visitor on whichever host they came in on. */
const goTo = (location: string) =>
  new NextResponse(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

/** `/logout` on the cabinet host: ends the session at the jobs worker (best effort), clears the
 * cookie and lands on sign-in. `?expired=1` comes along so sign-in can say why.
 *
 * Only the cabinet itself, a typed or bookmarked address, or a browser too old to say may sign the
 * seller out. A link on another site signs no one out and also lands on sign-in, never in the
 * cabinet: a stale session opened from such a link reaches here by the cabinet's own redirect, and
 * the browser keeps `cross-site` through redirects, so sending it back to `/` would loop. Sign-in
 * renders for a dead session and sends a live one on to the cabinet. */
export async function GET(request: Request) {
  const expired = new URL(request.url).searchParams.get('expired') === '1';
  const signIn = expired ? '/login?expired=1' : '/login';
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return goTo(signIn);
  const session = await readSession();
  if (session) await logout(session).catch(() => undefined);
  return clearSessionCookies(goTo(signIn));
}
