import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/** The seller's session. The `__Host-` prefix has the browser keep it only as set here: Secure,
 * for the whole host (`Path=/`) and for no other host (no `Domain`). */
export const SESSION_COOKIE = '__Host-chp_session';
/** The name the session went by before. Still read, so a seller signed in under it stays signed
 * in; never written again, and cleared with the current one. */
export const LEGACY_SESSION_COOKIE = 'chp_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/** The seller's session as a cookie: unreadable by scripts, sent only over https. */
export function sessionCookie(value: string) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

const emptied = (name: string) => ({ ...sessionCookie(''), name, maxAge: 0 });

/** Puts a new session on the response, and empties the old name so it cannot outlive it. */
export function setSessionCookie(response: NextResponse, value: string): NextResponse {
  response.cookies.set(sessionCookie(value));
  response.cookies.set(emptied(LEGACY_SESSION_COOKIE));
  return response;
}

/** Empties both session cookies on the response: signing out leaves neither behind. */
export function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.set(emptied(SESSION_COOKIE));
  response.cookies.set(emptied(LEGACY_SESSION_COOKIE));
  return response;
}

/** The current name first, then the old one; an empty value counts as none. */
const sessionIn = (jar: Pick<RequestCookies, 'get'>): string | null =>
  jar.get(SESSION_COOKIE)?.value || jar.get(LEGACY_SESSION_COOKIE)?.value || null;

export async function readSession(): Promise<string | null> {
  return sessionIn(await cookies());
}

/** The session from the request's own `Cookie` header: for route handlers that are handed the
 * request, and testable without Next's request scope. Read with Next's own cookie parser, so it
 * agrees with `readSession`: the last cookie of a name wins, names match exactly, and a pair whose
 * value will not decode is skipped. */
export function sessionFrom(request: Request): string | null {
  return sessionIn(new RequestCookies(request.headers));
}
