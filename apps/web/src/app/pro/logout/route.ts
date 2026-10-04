import { NextResponse } from 'next/server';
import { logout } from '@/lib/pro/client';
import { clearedSessionCookie, readSession } from '@/lib/pro/session';

/** A relative Location keeps the visitor on whichever host they came in on. */
const goTo = (location: string) =>
  new NextResponse(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

/** `/logout` on the cabinet host: ends the session at the jobs worker (best effort), clears the
 * cookie and lands on sign-in. `?expired=1` comes along so sign-in can say why.
 *
 * Only the cabinet itself, a typed or bookmarked address, or a browser too old to say may sign the
 * seller out; a link on another site just lands in the cabinet. */
export async function GET(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return goTo('/');
  const session = await readSession();
  if (session) await logout(session).catch(() => undefined);
  const expired = new URL(request.url).searchParams.get('expired') === '1';
  const response = goTo(expired ? '/login?expired=1' : '/login');
  response.cookies.set(clearedSessionCookie());
  return response;
}
