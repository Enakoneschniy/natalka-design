import { NextResponse } from 'next/server';
import { logout } from '@/lib/pro/client';
import { notFromThisOrigin } from '@/lib/pro/guard';
import { clearSessionCookies, sessionFrom } from '@/lib/pro/session';

/** A relative Location keeps the visitor on whichever host they came in on. */
const goTo = (location: string) =>
  new NextResponse(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

/** `/logout` by address: forgets the session on this browser and lands on sign-in. It never asks
 * the jobs worker to end the session: that is the «Выйти» form's POST below. `?expired=1` comes
 * along so sign-in can say why.
 *
 * Only the cabinet itself, a typed or bookmarked address, or a browser too old to say may clear
 * the cookie. A link on another site clears nothing and also lands on sign-in, never in the
 * cabinet: a stale session opened from such a link reaches here by the cabinet's own redirect, and
 * the browser keeps `cross-site` through redirects, so sending it back to `/` would loop. Sign-in
 * renders for a dead session and sends a live one on to the cabinet. */
export function GET(request: Request) {
  const expired = new URL(request.url).searchParams.get('expired') === '1';
  const signIn = expired ? '/login?expired=1' : '/login';
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return goTo(signIn);
  return clearSessionCookies(goTo(signIn));
}

/** «Выйти», a form on the cabinet's own pages: ends the session at the jobs worker, which signs
 * the seller out on every device (best effort), clears the cookies and lands on sign-in. A post
 * from any other page is refused and signs no one out. */
export async function POST(request: Request) {
  const refused = notFromThisOrigin(request);
  if (refused) return refused;
  const session = sessionFrom(request);
  if (session) await logout(session).catch(() => undefined);
  return clearSessionCookies(goTo('/login'));
}
