import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { describe, expect, it } from 'vitest';
import { sessionFrom } from './session';

const withCookie = (cookie: string) => new Request('https://pro.test/', { headers: { cookie } });
/** What Next's own `cookies()` would read from the same header. */
const nextReads = (cookie: string) =>
  new RequestCookies(new Headers({ cookie })).get('chp_session')?.value || null;

describe('sessionFrom', () => {
  it('reads the session among other cookies, decoded', () => {
    expect(sessionFrom(withCookie('a=1; chp_session=s%2D1; b=2'))).toBe('s-1');
  });

  it('has none without a cookie header or with an empty value', () => {
    expect(sessionFrom(new Request('https://pro.test/'))).toBeNull();
    expect(sessionFrom(withCookie('chp_session='))).toBeNull();
  });

  it('takes the last of two sessions, as Next does', () => {
    expect(sessionFrom(withCookie('chp_session=old; chp_session=new'))).toBe('new');
  });

  it('does not take a near-match name', () => {
    for (const cookie of [
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
    expect(sessionFrom(withCookie('chp_session=%E0%A4%A'))).toBeNull();
    expect(sessionFrom(withCookie('chp_session=good; chp_session=%E0%A4%A'))).toBe('good');
  });

  it('agrees with Next on every header above', () => {
    for (const cookie of [
      'a=1; chp_session=s%2D1; b=2',
      'chp_session=old; chp_session=new',
      'chp_session =x',
      'chp_session=good; chp_session=%E0%A4%A',
      'chp_session=%E0%A4%A',
      ';;chp_session=a;  chp_session=b',
    ]) {
      expect(sessionFrom(withCookie(cookie)), cookie).toBe(nextReads(cookie));
    }
  });
});
