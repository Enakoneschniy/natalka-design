import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { middleware } from './middleware';

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
