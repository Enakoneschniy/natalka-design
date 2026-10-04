import { NextResponse } from 'next/server';
import { logout } from '@/lib/pro/client';
import { clearedSessionCookie, readSession } from '@/lib/pro/session';

/** `/logout` on the cabinet host: ends the session at the jobs worker (best effort), clears the
 * cookie and lands on sign-in. `?expired=1` comes along so sign-in can say why. */
export async function GET(request: Request) {
  const session = await readSession();
  if (session) await logout(session).catch(() => undefined);
  const expired = new URL(request.url).searchParams.get('expired') === '1';
  // A relative Location keeps the visitor on whichever host they came in on.
  const response = new NextResponse(null, {
    status: 303,
    headers: { location: expired ? '/login?expired=1' : '/login', 'cache-control': 'no-store' },
  });
  response.cookies.set(clearedSessionCookie());
  return response;
}
