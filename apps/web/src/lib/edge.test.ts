import { describe, expect, it, vi } from 'vitest';
import {
  type EdgeEnv,
  gate,
  type Limiter,
  MAX_BODY_BYTES,
  MAX_IMAGE_BODY_BYTES,
  normalizePath,
  rateGroup,
  secured,
} from './edge';

const SHOP = 'chronika.me';
const PRO = 'pro.chronika.me';

function request(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Request {
  const { hostname } = new URL(url);
  return new Request(url, {
    method: init.method ?? 'GET',
    headers: { host: hostname, ...init.headers },
    body: init.body,
  });
}

const ok = () => vi.fn(async (_request: Request) => new Response('app', { status: 200 }));

const env = (extra: Partial<EdgeEnv> = {}): EdgeEnv => ({ PRO_HOSTS: PRO, ...extra });

describe('normalizePath', () => {
  it('collapses slashes, decodes once and drops a trailing slash', () => {
    expect(normalizePath('/api//orders/')).toBe('/api/orders');
    expect(normalizePath('/api/%6frders')).toBe('/api/orders');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });

  it('keeps a malformed escape as it came instead of throwing', () => {
    expect(normalizePath('/api/%E0%A4%A')).toBe('/api/%E0%A4%A');
  });
});

describe('gate: request bodies', () => {
  it('lets a GET through without a length', async () => {
    const next = ok();
    const response = await gate(request(`https://${SHOP}/ru`), env(), next);
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it('refuses a POST that does not say how long it is', async () => {
    const next = ok();
    const response = await gate(
      request(`https://${SHOP}/api/orders`, { method: 'POST' }),
      env(),
      next,
    );
    expect(response.status).toBe(411);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a chunked body of unknown length, whatever the method', async () => {
    for (const method of ['POST', 'DELETE']) {
      const response = await gate(
        request(`https://${SHOP}/api/subscriptions/t`, {
          method,
          headers: { 'transfer-encoding': 'chunked' },
        }),
        env(),
        ok(),
      );
      expect(response.status).toBe(411);
    }
  });

  it('lets a DELETE without a body through: fetch sends no length for one', async () => {
    const next = ok();
    const response = await gate(
      request(`https://${SHOP}/api/subscriptions/t`, { method: 'DELETE' }),
      env(),
      next,
    );
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it('refuses a length that is not a number', async () => {
    const response = await gate(
      request(`https://${SHOP}/api/orders`, {
        method: 'POST',
        headers: { 'content-length': 'abc' },
      }),
      env(),
      ok(),
    );
    expect(response.status).toBe(411);
  });

  it('caps every body at 64 KB', async () => {
    const at = await gate(
      request(`https://${SHOP}/api/orders`, {
        method: 'POST',
        headers: { 'content-length': String(MAX_BODY_BYTES) },
      }),
      env(),
      ok(),
    );
    expect(at.status).toBe(200);
    const over = await gate(
      request(`https://${SHOP}/api/orders`, {
        method: 'POST',
        headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
      }),
      env(),
      ok(),
    );
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({ error: 'too large' });
  });

  it('allows a brand picture up to 1.1 MB, and nothing else that size', async () => {
    const size = String(MAX_IMAGE_BODY_BYTES);
    for (const kind of ['logo', 'photo']) {
      const response = await gate(
        request(`https://${PRO}/api/pro/x/brand/${kind}`, {
          method: 'PUT',
          headers: { 'content-length': size },
        }),
        env(),
        ok(),
      );
      expect(response.status).toBe(200);
    }
    const over = await gate(
      request(`https://${PRO}/api/pro/x/brand/logo`, {
        method: 'PUT',
        headers: { 'content-length': String(MAX_IMAGE_BODY_BYTES + 1) },
      }),
      env(),
      ok(),
    );
    expect(over.status).toBe(413);
    const elsewhere = await gate(
      request(`https://${PRO}/api/pro/x/brand`, {
        method: 'PUT',
        headers: { 'content-length': size },
      }),
      env(),
      ok(),
    );
    expect(elsewhere.status).toBe(413);
  });
});

describe('gate: which host serves what', () => {
  const status = async (host: string, path: string) =>
    (await gate(request(`https://${host}${path}`), env(), ok())).status;

  it('keeps the cabinet tree and its API off the shop, dotted or not', async () => {
    for (const path of [
      '/pro',
      '/pro/',
      '/pro/clients',
      '/pro/clients/a.b',
      '/pro/x.png',
      '/%70ro/clients',
      '/api/pro',
      '/api/pro/login',
      '/api/pro/x/clients',
    ]) {
      expect(await status(SHOP, path), path).toBe(404);
    }
  });

  it('leaves the shop its own paths', async () => {
    for (const path of ['/ru', '/prophecy', '/api/orders', '/api/cities', '/og.png', '/llms.txt']) {
      expect(await status(SHOP, path), path).toBe(200);
    }
    expect(await status(`www.${SHOP}`, '/ru')).toBe(200);
  });

  it('gives the cabinet host only its own API and city search', async () => {
    for (const path of ['/api/orders', '/api/preview', '/api/jobs/t', '/api/subscriptions']) {
      expect(await status(PRO, path), path).toBe(404);
    }
    for (const path of ['/api/pro/login', '/api/pro/x/clients', '/api/cities', '/clients']) {
      expect(await status(PRO, path), path).toBe(200);
    }
  });

  it('serves no shop files on the cabinet host, only the build, the icons and robots', async () => {
    for (const path of ['/og.png', '/sample/page-1.png', '/llms.txt', '/sitemap.xml', '/x.php']) {
      expect(await status(PRO, path), path).toBe(404);
    }
    for (const path of [
      '/_next/static/chunks/app.js',
      '/icon.svg',
      '/apple-icon.png',
      '/favicon.ico',
      '/robots.txt',
    ]) {
      expect(await status(PRO, path), path).toBe(200);
    }
  });

  it('answers an API path with JSON and a page path with text', async () => {
    const api = await gate(request(`https://${PRO}/api/orders`), env(), ok());
    expect(await api.json()).toEqual({ error: 'not found' });
    const page = await gate(request(`https://${SHOP}/pro/clients`), env(), ok());
    expect(page.headers.get('content-type')).toContain('text/plain');
  });
});

describe('gate: closed countries', () => {
  it('refuses the API to a country the site is closed to', async () => {
    for (const country of ['RU', 'ru']) {
      const response = await gate(
        request(`https://${SHOP}/api/cities?q=mo`, { headers: { 'cf-ipcountry': country } }),
        env(),
        ok(),
      );
      expect(response.status).toBe(403);
    }
    const pro = await gate(
      request(`https://${PRO}/api/pro/login`, {
        method: 'POST',
        headers: { 'cf-ipcountry': 'RU', 'content-length': '2' },
        body: '{}',
      }),
      env(),
      ok(),
    );
    expect(pro.status).toBe(403);
  });

  it('leaves pages to the middleware and other countries alone', async () => {
    const page = await gate(
      request(`https://${SHOP}/ru`, { headers: { 'cf-ipcountry': 'RU' } }),
      env(),
      ok(),
    );
    expect(page.status).toBe(200);
    const elsewhere = await gate(
      request(`https://${SHOP}/api/cities?q=mo`, { headers: { 'cf-ipcountry': 'DE' } }),
      env(),
      ok(),
    );
    expect(elsewhere.status).toBe(200);
  });
});

describe('rateGroup', () => {
  it('sorts the costly routes into their groups', () => {
    expect(rateGroup('POST', '/api/pro/login')).toBe('auth');
    expect(rateGroup('POST', '/api/pro/signup')).toBe('auth');
    expect(rateGroup('POST', '/api/pro/session')).toBe('auth');
    expect(rateGroup('POST', '/api/orders')).toBe('orders');
    expect(rateGroup('POST', '/api/jobs/a.b.c/checkout')).toBe('orders');
    expect(rateGroup('POST', '/api/preview')).toBe('preview');
    expect(rateGroup('POST', '/api/subscriptions')).toBe('subscriptions');
    expect(rateGroup('POST', '/api/subscriptions/confirm')).toBe('subscriptions');
    expect(rateGroup('GET', '/api/cities')).toBe('cities');
    expect(rateGroup('POST', '/api/pro/x/clients')).toBe('pro');
    expect(rateGroup('DELETE', '/api/pro/x/clients/1')).toBe('pro');
    expect(rateGroup('PUT', '/api/pro/x/brand/logo')).toBe('pro');
  });

  it('leaves reads and everything else unlimited', () => {
    expect(rateGroup('GET', '/api/jobs/a.b.c')).toBeNull();
    expect(rateGroup('GET', '/api/pro/x/clients')).toBeNull();
    expect(rateGroup('PATCH', '/api/subscriptions/t')).toBeNull();
    expect(rateGroup('GET', '/ru')).toBeNull();
    expect(rateGroup('POST', '/logout')).toBeNull();
  });
});

describe('gate: rate limits', () => {
  const limiter = (success: boolean) => {
    const calls: string[] = [];
    const binding: Limiter = {
      limit: vi.fn(async ({ key }: { key: string }) => {
        calls.push(key);
        return { success };
      }),
    };
    return { binding, calls };
  };

  it('answers 429 once the address has used its share, keyed by group and address', async () => {
    const { binding, calls } = limiter(false);
    const next = ok();
    const response = await gate(
      request(`https://${SHOP}/api/orders`, {
        method: 'POST',
        headers: { 'content-length': '2', 'cf-connecting-ip': '203.0.113.7' },
        body: '{}',
      }),
      env({ RL_ORDERS: binding }),
      next,
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'too_many' });
    expect(calls).toEqual(['orders:203.0.113.7']);
    expect(next).not.toHaveBeenCalled();
  });

  it('counts each group on its own binding', async () => {
    const auth = limiter(true);
    const cities = limiter(true);
    await gate(
      request(`https://${SHOP}/api/cities?q=ki`, {
        headers: { 'cf-connecting-ip': '198.51.100.1' },
      }),
      env({ RL_AUTH: auth.binding, RL_CITIES: cities.binding }),
      ok(),
    );
    expect(cities.calls).toEqual(['cities:198.51.100.1']);
    expect(auth.calls).toEqual([]);
  });

  it('lets the request through when the binding is absent or fails', async () => {
    const failing: Limiter = {
      limit: async () => {
        throw new Error('down');
      },
    };
    for (const extra of [{}, { RL_PREVIEW: failing }]) {
      const response = await gate(
        request(`https://${SHOP}/api/preview`, {
          method: 'POST',
          headers: { 'content-length': '2' },
          body: '{}',
        }),
        env(extra),
        ok(),
      );
      expect(response.status).toBe(200);
    }
  });
});

describe('secured', () => {
  it('adds the shop headers to every answer, without HSTS', () => {
    const response = secured(new Response('page', { headers: { 'content-type': 'text/html' } }), {
      pro: false,
    });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://checkout.stripe.com",
    );
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('sends no referrer at all from the cabinet', () => {
    const response = secured(new Response('page'), { pro: true });
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('keeps a header the app already set, and the status, body and cookies', async () => {
    const original = new Response('made', {
      status: 201,
      headers: { 'referrer-policy': 'same-origin' },
    });
    original.headers.append('set-cookie', 'a=1; Path=/');
    original.headers.append('set-cookie', 'b=2; Path=/');
    const response = secured(original, { pro: false });
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('made');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('lets the browser show a PDF in its own viewer', () => {
    const response = secured(
      new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }),
      { pro: false },
    );
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('object-src');
  });

  it('puts the headers on the gate’s own refusals too', async () => {
    const response = await gate(request(`https://${PRO}/api/orders`), env(), ok());
    expect(response.status).toBe(404);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('hands the app the very request it received', async () => {
    const next = ok();
    const incoming = request(`https://${SHOP}/ru?x=1`);
    await gate(incoming, env(), next);
    expect(next.mock.calls[0]?.[0]).toBe(incoming);
  });
});
