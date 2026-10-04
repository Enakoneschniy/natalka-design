import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'chp_session';
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

export function clearedSessionCookie() {
  return { ...sessionCookie(''), maxAge: 0 };
}

export async function readSession(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value || null;
}

/** The session from the request's own `Cookie` header: for route handlers that are handed the
 * request, and testable without Next's request scope. Read with Next's own cookie parser, so it
 * agrees with `readSession`: the last `chp_session` wins, names match exactly, and a pair whose
 * value will not decode is skipped. */
export function sessionFrom(request: Request): string | null {
  return new RequestCookies(request.headers).get(SESSION_COOKIE)?.value || null;
}
