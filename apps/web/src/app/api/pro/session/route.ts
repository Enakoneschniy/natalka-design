import { NextResponse } from 'next/server';
import { startSession } from '@/lib/pro/client';
import { jsonBody, notOnProHost, notSameOrigin, unavailable } from '@/lib/pro/guard';
import { sessionCookie } from '@/lib/pro/session';

const expired = () => NextResponse.json({ error: 'link expired' }, { status: 400 });

/** The confirm page's «Войти»: trades the emailed token for a session and keeps it in a cookie.
 * Only this POST spends the token, so a mail scanner opening the link does not. */
export async function POST(request: Request) {
  const blocked = notOnProHost(request);
  if (blocked) return blocked;
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const body = await jsonBody(request);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) return expired();
  let started: Awaited<ReturnType<typeof startSession>>;
  try {
    started = await startSession(token);
  } catch {
    return unavailable();
  }
  if (!started) return expired();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(started.session));
  return response;
}
