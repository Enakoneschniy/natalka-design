import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  clearSessionCookies,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  sessionFrom,
  setSessionCookie,
} from './session';

const withCookie = (cookie: string) => new Request('https://pro.test/', { headers: { cookie } });
/** What Next's own `cookies()` would make of the same header, read the way `readSession` does. */
const nextReads = (cookie: string) => {
  const jar = new RequestCookies(new Headers({ cookie }));
  return jar.get('__Host-chp_session')?.value || jar.get('chp_session')?.value || null;
};

describe('session cookie names', () => {
  it('keeps the session under a __Host- name and still knows the old one', () => {
    expect(SESSION_COOKIE).toBe('__Host-chp_session');
    expect(LEGACY_SESSION_COOKIE).toBe('chp_session');
  });
});

describe('sessionFrom', () => {
  it('reads the session among other cookies, decoded', () => {
    expect(sessionFrom(withCookie('a=1; __Host-chp_session=s%2D1; b=2'))).toBe('s-1');
  });

  it('still reads a session kept under the old name', () => {
    expect(sessionFrom(withCookie('a=1; chp_session=old'))).toBe('old');
  });

  it('prefers the current name over the old one, whichever comes first', () => {
    expect(sessionFrom(withCookie('chp_session=old; __Host-chp_session=new'))).toBe('new');
    expect(sessionFrom(withCookie('__Host-chp_session=new; chp_session=old'))).toBe('new');
  });

  it('has none without a cookie header or with empty values', () => {
    expect(sessionFrom(new Request('https://pro.test/'))).toBeNull();
    expect(sessionFrom(withCookie('__Host-chp_session='))).toBeNull();
    expect(sessionFrom(withCookie('chp_session='))).toBeNull();
    expect(sessionFrom(withCookie('__Host-chp_session=; chp_session='))).toBeNull();
  });

  it('takes the last of two sessions under one name, as Next does', () => {
    expect(sessionFrom(withCookie('__Host-chp_session=old; __Host-chp_session=new'))).toBe('new');
    expect(sessionFrom(withCookie('chp_session=old; chp_session=new'))).toBe('new');
  });

  it('does not take a near-match name', () => {
    for (const cookie of [
      '__host-chp_session=x',
      '__Host-chp_session2=x',
      'Host-chp_session=x',
      '__Secure-chp_session=x',
      'chp_session2=x',
      'xchp_session=x',
      'CHP_SESSION=x',
      'chp_session =x',
      'chp_sessio=x',
    ]) {
      expect(sessionFrom(withCookie(cookie)), cookie).toBeNull();
    }
  });

  it('skips a value that will not decode and keeps the one before it, as Next does', () => {
    const broken = '__Host-chp_session=%E0%A4%A';
    expect(sessionFrom(withCookie(broken))).toBeNull();
    expect(sessionFrom(withCookie(`__Host-chp_session=good; ${broken}`))).toBe('good');
  });

  it('agrees with Next on every header above', () => {
    for (const cookie of [
      'a=1; __Host-chp_session=s%2D1; b=2',
      'chp_session=old; __Host-chp_session=new',
      '__Host-chp_session=; chp_session=old',
      'chp_session=old; chp_session=new',
      '__Host-chp_session =x',
      '__Host-chp_session=good; __Host-chp_session=%E0%A4%A',
      'chp_session=%E0%A4%A',
      ';;__Host-chp_session=a;  __Host-chp_session=b',
    ]) {
      expect(sessionFrom(withCookie(cookie)), cookie).toBe(nextReads(cookie));
    }
  });
});

describe('writing the cookie', () => {
  const setCookies = (response: Response) => response.headers.getSetCookie();
  const named = (response: Response, name: string) =>
    setCookies(response).find((line) => line.startsWith(`${name}=`)) ?? '';

  it('writes the session under the current name only as the browser keeps a __Host- cookie', () => {
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, 's-1');
    const cookie = named(response, '__Host-chp_session');
    expect(cookie).toMatch(/^__Host-chp_session=s-1;/);
    expect(cookie).toMatch(/; Path=\/(;|$)/);
    expect(cookie).toMatch(/; Secure(;|$)/);
    expect(cookie).toMatch(/; HttpOnly(;|$)/);
    expect(cookie).toMatch(/; SameSite=lax(;|$)/i);
    expect(cookie).toMatch(/; Max-Age=2592000(;|$)/);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('empties the old name while it writes the new one', () => {
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, 's-1');
    expect(named(response, 'chp_session')).toMatch(/^chp_session=; Path=\/;.*Max-Age=0/);
    expect(setCookies(response)).toHaveLength(2);
  });

  it('clears both names on sign-out', () => {
    const response = clearSessionCookies(NextResponse.json({ ok: true }));
    const current = named(response, '__Host-chp_session');
    expect(current).toMatch(/^__Host-chp_session=; Path=\/;.*Max-Age=0/);
    // A __Host- cookie is replaced only by one that is Secure, on `/`, with no Domain.
    expect(current).toMatch(/; Secure(;|$)/);
    expect(current).not.toMatch(/Domain=/i);
    expect(named(response, 'chp_session')).toMatch(/^chp_session=; Path=\/;.*Max-Age=0/);
  });
});
