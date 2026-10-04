import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from './login/route';
import { POST as session } from './session/route';
import { POST as signup } from './signup/route';

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

/** What a same-origin `fetch` from the cabinet's own page sends. */
const post = (
  path: string,
  body: unknown,
  host = 'pro.chronika.me',
  headers: Record<string, string> = {},
) =>
  new Request(`https://${host}/api/pro/${path}`, {
    method: 'POST',
    headers: {
      host,
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: `https://${host}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

/** Like `post`, but with exactly these headers (plus host): to drop the browser's own. */
const raw = (path: string, headers: Record<string, string>, body: string) =>
  new Request(`https://pro.chronika.me/api/pro/${path}`, {
    method: 'POST',
    headers: { host: 'pro.chronika.me', ...headers },
    body,
  });

describe('api/pro routes', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const forwarded = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    return { url, body: JSON.parse(String(init?.body)) };
  };

  beforeEach(() => {
    vi.stubEnv('PRO_HOSTS', undefined);
    vi.stubEnv('NATALKA_JOBS_URL', 'https://jobs.test');
    vi.stubEnv('PRO_API_KEY', 'k-123');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('signup', () => {
    const input = { email: 'a@b.co', name: 'Мария', invite: 'START3', terms: true };

    it('passes the 202 through and forwards the accepted terms', async () => {
      fetchMock.mockResolvedValue(reply(202, { ok: true }));
      const res = await signup(post('signup', input));
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ ok: true });
      const sent = forwarded();
      expect(sent.url).toBe('https://jobs.test/v1/pro/signup');
      expect(sent.body).toMatchObject({ email: 'a@b.co', name: 'Мария', terms: true });
    });

    it('passes a validation error through as 400', async () => {
      fetchMock.mockResolvedValue(reply(400, { error: 'name' }));
      const res = await signup(post('signup', input));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'name' });
    });

    it('forwards terms:false for anything but true, and leaves an empty invite out', async () => {
      fetchMock.mockResolvedValue(reply(400, { error: 'terms' }));
      const res = await signup(post('signup', { ...input, invite: '  ', terms: 'yes' }));
      expect(res.status).toBe(400);
      const sent = forwarded().body;
      expect(sent.terms).toBe(false);
      expect(sent).not.toHaveProperty('invite');
    });

    it('is not there on the shop host', async () => {
      const res = await signup(post('signup', input, 'chronika.me'));
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('session', () => {
    it('sets the session cookie on a good token', async () => {
      fetchMock.mockResolvedValue(
        reply(200, { session: 's-1', account: { email: 'a@b.co', tone: 'warm' } }),
      );
      const res = await session(post('session', { token: 't-1' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(forwarded().body).toEqual({ token: 't-1' });
      const cookie = res.headers.get('set-cookie') ?? '';
      expect(cookie).toMatch(/^chp_session=s-1/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Max-Age=2592000/i);
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('answers 400 and sets no cookie on a bad token', async () => {
      fetchMock.mockResolvedValue(reply(400, { error: 'invalid' }));
      const res = await session(post('session', { token: 'used' }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'link expired' });
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('is not there on the shop host', async () => {
      const res = await session(post('session', { token: 't-1' }, 'chronika.me'));
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('maps the jobs 202 to 202 {ok:true}', async () => {
      fetchMock.mockResolvedValue(reply(202, { ok: true }));
      const res = await login(post('login', { email: 'a@b.co' }));
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ ok: true });
      expect(forwarded().body).toEqual({ email: 'a@b.co' });
    });

    it('maps a jobs 503 to 503', async () => {
      fetchMock.mockResolvedValue(reply(503, { error: 'mail' }));
      const res = await login(post('login', { email: 'a@b.co' }));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'unavailable' });
    });

    it('answers 503 when the jobs worker cannot be reached', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      const res = await login(post('login', { email: 'a@b.co' }));
      expect(res.status).toBe(503);
    });

    it('answers 400 to a body that is not JSON', async () => {
      const res = await login(
        raw('login', { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, 'no'),
      );
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not leak the jobs path in a 400 without a body', async () => {
      fetchMock.mockResolvedValue(reply(400));
      const res = await login(post('login', { email: 'a@b.co' }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid' });
    });
  });

  describe('only the cabinet own pages may post', () => {
    const body = JSON.stringify({ token: 't-1' });

    it('refuses a cross-site request with 403', async () => {
      const res = await session(
        post('session', { token: 't-1' }, undefined, { 'sec-fetch-site': 'cross-site' }),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'origin' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a same-site (sibling subdomain) request with 403', async () => {
      const res = await login(
        post('login', { email: 'a@b.co' }, undefined, { 'sec-fetch-site': 'same-site' }),
      );
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a text/plain body (a cross-site form) with 415', async () => {
      const res = await session(
        raw('session', { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' }, body),
      );
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: 'content-type' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a matching Origin when Sec-Fetch-Site is absent', async () => {
      fetchMock.mockResolvedValue(
        reply(200, { session: 's-1', account: { email: 'a', tone: 'vy' } }),
      );
      const res = await session(
        raw(
          'session',
          { 'content-type': 'application/json', origin: 'https://pro.chronika.me' },
          body,
        ),
      );
      expect(res.status).toBe(200);
    });

    it('refuses a foreign Origin when Sec-Fetch-Site is absent', async () => {
      const res = await session(
        raw(
          'session',
          { 'content-type': 'application/json', origin: 'https://evil.example' },
          body,
        ),
      );
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a request with neither header', async () => {
      const res = await signup(raw('signup', { 'content-type': 'application/json' }, body));
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
