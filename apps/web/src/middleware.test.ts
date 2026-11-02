import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

/** One code that applies for as long as the tests run, larger than any offer. */
vi.mock('@/lib/promo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/promo')>();
  const codes = [
    {
      code: 'TESTCODE',
      percent: 60,
      starts: new Date('2020-01-01'),
      ends: new Date('2100-01-01'),
      note: 'test',
    },
  ];
  return {
    ...actual,
    activePromo: (value: unknown, now?: Date) => actual.activePromo(value, now, codes),
    lookupPromo: (value: unknown, now?: Date) => actual.lookupPromo(value, now, codes),
  };
});

const request = (url: string, headers: Record<string, string>) => new NextRequest(url, { headers });

const rewriteOf = (response: Response) => response.headers.get('x-middleware-rewrite') ?? '';

describe('middleware: the cabinet host', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.PRO_HOSTS;
    delete process.env.PRO_HOSTS;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PRO_HOSTS;
    else process.env.PRO_HOSTS = saved;
  });

  it('rewrites a pro-host path into the internal /pro tree, never indexed', async () => {
    const response = await middleware(
      request('https://pro.chronika.me/clients?x=1', { host: 'pro.chronika.me' }),
    );
    expect(new URL(rewriteOf(response)).pathname).toBe('/pro/clients');
    expect(new URL(rewriteOf(response)).search).toBe('?x=1');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('maps the pro-host root to /pro', async () => {
    const response = await middleware(
      request('https://pro.chronika.me/', { host: 'pro.chronika.me' }),
    );
    expect(new URL(rewriteOf(response)).pathname).toBe('/pro');
  });

  it('answers 404 for the internal tree on the shop host', async () => {
    const response = await middleware(
      request('https://chronika.me/pro/clients', { host: 'chronika.me' }),
    );
    expect(rewriteOf(response)).not.toContain('/pro/');
    expect(response.status).toBe(404);
  });

  it('answers 404 for the bare /pro on the shop host', async () => {
    const response = await middleware(request('https://chronika.me/pro', { host: 'chronika.me' }));
    expect(response.status).toBe(404);
  });

  it('leaves the shop alone', async () => {
    const response = await middleware(request('https://chronika.me/ru', { host: 'chronika.me' }));
    expect(rewriteOf(response)).not.toContain('/pro');
    expect(response.status).toBe(200);
    const product = await middleware(
      request('https://chronika.me/ru/products', { host: 'chronika.me' }),
    );
    expect(rewriteOf(product)).not.toContain('/pro');
  });

  it('notes the campaign once, cleaned, and replaces a cookie that holds nothing usable', async () => {
    const fresh = await middleware(
      request('https://chronika.me/ru?utm_source=Meta<b>', { host: 'chronika.me' }),
    );
    expect(fresh.cookies.get('chr_src')?.value).toBe('metab');
    const kept = await middleware(
      request('https://chronika.me/ru?utm_source=tiktok', {
        host: 'chronika.me',
        cookie: 'chr_src=meta',
      }),
    );
    expect(kept.cookies.get('chr_src')).toBeUndefined();
    const replaced = await middleware(
      request('https://chronika.me/ru?utm_source=tiktok', {
        host: 'chronika.me',
        cookie: 'chr_src=<>!',
      }),
    );
    expect(replaced.cookies.get('chr_src')?.value).toBe('tiktok');
  });

  it('sets no price-test cookie, and takes back one left from the test', async () => {
    const visit = (cookie?: string) =>
      middleware(
        request('https://chronika.me/ru', { host: 'chronika.me', ...(cookie ? { cookie } : {}) }),
      );
    expect((await visit()).headers.get('set-cookie') ?? '').not.toMatch(/\bcx=/);
    const cleared = (await visit('cx=a.c2lnbmF0dXJl')).headers.get('set-cookie') ?? '';
    expect(cleared).toMatch(/\bcx=;/);
    expect(cleared).toMatch(/Max-Age=0/i);
  });

  it('keeps a promo code from the link, and only one that applies', async () => {
    const visit = (query: string) =>
      middleware(request(`https://chronika.me/ru${query}`, { host: 'chronika.me' }));
    const kept = (await visit('?code=testcode')).cookies.get('chr_promo');
    expect(kept?.value).toBe('TESTCODE');
    expect(kept?.httpOnly).toBe(true);
    expect((await visit('?code=NOSUCH')).cookies.get('chr_promo')).toBeUndefined();
  });

  it('sends the bare address to German for a German browser, Russian otherwise, query and all', async () => {
    const go = async (language: string | undefined, query = '') =>
      (
        await middleware(
          request(`https://chronika.me/${query}`, {
            host: 'chronika.me',
            ...(language ? { 'accept-language': language } : {}),
          }),
        )
      ).headers.get('location');
    expect(await go('de-DE,de;q=0.9,en;q=0.8')).toBe('https://chronika.me/de');
    expect(await go('de')).toBe('https://chronika.me/de');
    expect(await go('ru-RU,ru;q=0.9,de;q=0.8')).toBe('https://chronika.me/ru');
    expect(await go('en-US')).toBe('https://chronika.me/ru');
    expect(await go(undefined)).toBe('https://chronika.me/ru');
    expect(await go('de-AT', '?code=testcode&utm_source=youtube')).toBe(
      'https://chronika.me/de?code=testcode&utm_source=youtube',
    );
  });

  it('serves German pages under /de without sending them anywhere', async () => {
    const response = await middleware(
      request('https://chronika.me/de/start', { host: 'chronika.me' }),
    );
    expect(response.headers.get('location')).toBeNull();
  });

  it('keeps Russia out of the cabinet too', async () => {
    const response = await middleware(
      request('https://pro.chronika.me/clients', {
        host: 'pro.chronika.me',
        'cf-ipcountry': 'RU',
      }),
    );
    expect(new URL(rewriteOf(response)).pathname).toBe('/unavailable');
  });
});
