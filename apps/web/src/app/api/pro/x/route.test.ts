import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST, PUT } from './[...path]/route';

const HOST = 'pro.chronika.me';
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });

/** A request from the cabinet's own page, with its session; `headers` overrides or adds. */
const req = (
  method: string,
  path: string,
  init: { headers?: Record<string, string | null>; body?: BodyInit; host?: string } = {},
) => {
  const host = init.host ?? HOST;
  const headers: Record<string, string> = {};
  const merged: Record<string, string | null> = {
    host,
    cookie: 'chp_session=s-1; other=x',
    'sec-fetch-site': 'same-origin',
    origin: `https://${host}`,
    ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
    ...init.headers,
  };
  for (const [k, v] of Object.entries(merged)) if (v !== null) headers[k] = v;
  return new Request(`https://${host}/api/pro/x/${path}`, { method, headers, body: init.body });
};

describe('api/pro/x proxy', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, init, headers: new Headers(init.headers) };
  };

  beforeEach(() => {
    vi.stubEnv('PRO_HOSTS', undefined);
    vi.stubEnv('NATALKA_JOBS_URL', 'https://jobs.test/');
    vi.stubEnv('PRO_API_KEY', 'k-123');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is not there on the shop host', async () => {
    const res = await GET(req('GET', 'me', { host: 'chronika.me' }), ctx('me'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 404 to anything off the allowlist, without calling jobs', async () => {
    for (const [method, handler, path] of [
      ['GET', GET, '../orders'],
      ['GET', GET, 'orders'],
      ['DELETE', DELETE, 'purchases'],
      ['GET', GET, 'clients/a%2Fb'],
      ['POST', POST, 'logout'],
    ] as const) {
      const res = await handler(req(method, path, { body: method === 'GET' ? undefined : '{}' }), {
        params: Promise.resolve({ path: path.split('/') }),
      });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a cross-site POST with 403', async () => {
    const res = await POST(
      req('POST', 'readings', { body: '{}', headers: { 'sec-fetch-site': 'cross-site' } }),
      ctx('readings'),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a cross-site DELETE with 403', async () => {
    const res = await DELETE(
      req('DELETE', 'clients/c-1', { headers: { 'sec-fetch-site': 'cross-site' } }),
      ctx('clients/c-1'),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a text/plain POST with 415', async () => {
    const res = await POST(
      req('POST', 'readings', { body: '{}', headers: { 'content-type': 'text/plain' } }),
      ctx('readings'),
    );
    expect(res.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 401 without a session', async () => {
    const res = await GET(req('GET', 'me', { headers: { cookie: null } }), ctx('me'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'signed out' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards an allowlisted GET with the key, the bearer and the query', async () => {
    fetchMock.mockResolvedValue(json(200, { readings: [] }));
    const request = new Request(`https://${HOST}/api/pro/x/readings?client=c-1&x=%2F`, {
      headers: { host: HOST, cookie: 'chp_session=s-1' },
    });
    const res = await GET(request, ctx('readings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ readings: [] });
    const { url, init, headers } = sent();
    expect(url).toBe('https://jobs.test/v1/pro/readings?client=c-1&x=%2F');
    expect(init.method).toBe('GET');
    expect(headers.get('x-pro-key')).toBe('k-123');
    expect(headers.get('authorization')).toBe('Bearer s-1');
    expect(headers.get('cookie')).toBeNull();
  });

  it('forwards a JSON POST body and passes the status through', async () => {
    fetchMock.mockResolvedValue(json(409, { error: 'limit' }));
    const res = await POST(
      req('POST', 'readings/r-1/sections/s-2/regenerate', { body: '{"a":1}' }),
      ctx('readings/r-1/sections/s-2/regenerate'),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'limit' });
    const { url, init, headers } = sent();
    expect(url).toBe('https://jobs.test/v1/pro/readings/r-1/sections/s-2/regenerate');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('does not pass a mutation query string on', async () => {
    fetchMock.mockResolvedValue(json(201, { ok: true }));
    const request = new Request(`https://${HOST}/api/pro/x/clients?evil=1`, {
      method: 'POST',
      headers: {
        host: HOST,
        cookie: 'chp_session=s-1',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    await POST(request, ctx('clients'));
    expect(sent().url).toBe('https://jobs.test/v1/pro/clients');
  });

  it('maps a jobs 401 to 401 signed out', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'unauthorized' }));
    const res = await GET(req('GET', 'me'), ctx('me'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'signed out' });
  });

  it('answers 503 when jobs cannot be reached or does not answer JSON', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await GET(req('GET', 'me'), ctx('me'))).status).toBe(503);
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 500 }));
    const res = await GET(req('GET', 'me'), ctx('me'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('streams a PDF with its type and disposition, never cached', async () => {
    fetchMock.mockResolvedValue(
      new Response('%PDF-1.7', {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="r.pdf"',
          'cache-control': 'public, max-age=60',
        },
      }),
    );
    const res = await GET(req('GET', 'readings/r-1/pdf'), ctx('readings/r-1/pdf'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="r.pdf"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.text()).toBe('%PDF-1.7');
  });

  it('passes a missing PDF through as JSON 404', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'not found' }));
    const res = await GET(req('GET', 'readings/r-1/pdf'), ctx('readings/r-1/pdf'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('streams a brand image, never cached', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }),
    );
    const res = await GET(req('GET', 'brand/logo'), ctx('brand/logo'));
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  describe('logo upload', () => {
    const upload = (headers: Record<string, string | null>, body: BodyInit = new Uint8Array(4)) =>
      PUT(req('PUT', 'brand/logo', { headers, body }), ctx('brand/logo'));

    it('forwards a PNG raw', async () => {
      fetchMock.mockResolvedValue(json(200, { ok: true }));
      const res = await upload({ 'content-type': 'image/png', 'content-length': '4' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const { url, init, headers } = sent();
      expect(url).toBe('https://jobs.test/v1/pro/brand/logo');
      expect(init.method).toBe('PUT');
      expect(headers.get('content-type')).toBe('image/png');
      expect(headers.get('authorization')).toBe('Bearer s-1');
      expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(new Uint8Array(4));
    });

    it('refuses image/gif with 415', async () => {
      const res = await upload({ 'content-type': 'image/gif', 'content-length': '4' });
      expect(res.status).toBe(415);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a JSON body with 415', async () => {
      const res = await upload({ 'content-type': 'application/json', 'content-length': '2' }, '{}');
      expect(res.status).toBe(415);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a 2 MB content-length with 413', async () => {
      const res = await upload({ 'content-type': 'image/jpeg', 'content-length': '2097152' });
      expect(res.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a body larger than its content-length claims with 413', async () => {
      const res = await upload(
        { 'content-type': 'image/jpeg', 'content-length': '4' },
        new Uint8Array(1_048_577),
      );
      expect(res.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a cross-site upload with 403', async () => {
      const res = await upload({
        'content-type': 'image/png',
        'content-length': '4',
        'sec-fetch-site': 'cross-site',
      });
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
