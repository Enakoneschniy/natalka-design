import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProUnauthorized,
  peekLogin,
  proCall,
  requestLogin,
  requestSignup,
  startSession,
} from './client';

const headersOf = (init: RequestInit | undefined) =>
  (init?.headers ?? {}) as Record<string, string>;

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe('pro client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sent = () => fetchMock.mock.calls[0] as [string, RequestInit | undefined];

  beforeEach(() => {
    vi.stubEnv('NATALKA_JOBS_URL', 'https://jobs.test/');
    vi.stubEnv('PRO_API_KEY', 'k-123');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the api key and the seller bearer', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: 1 }));
    const out = await proCall('/v1/pro/me', { session: 's-1' });
    expect(out).toEqual({ status: 200, data: { ok: 1 } });
    const [url, init] = sent();
    expect(url).toBe('https://jobs.test/v1/pro/me');
    expect(headersOf(init)['x-pro-key']).toBe('k-123');
    expect(headersOf(init).authorization).toBe('Bearer s-1');
  });

  describe('a redirect from jobs', () => {
    const redirect = (status: number) =>
      new Response(null, { status, headers: { location: 'https://elsewhere.test/' } });

    it('is not followed: the key and the bearer go to jobs and nowhere else', async () => {
      fetchMock.mockResolvedValue(redirect(302));
      await expect(proCall('/v1/pro/me', { session: 's-1' })).rejects.toThrow('redirect → 302');
      expect(sent()[1]?.redirect).toBe('manual');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([301, 302, 303, 307, 308])('%s is an outage for every call', async (status) => {
      fetchMock.mockResolvedValue(redirect(status));
      await expect(requestLogin('a@b.co')).rejects.toThrow(`redirect → ${status}`);
      await expect(startSession('t-1')).rejects.toThrow(`redirect → ${status}`);
      await expect(peekLogin('t-1')).rejects.toThrow(`redirect → ${status}`);
    });

    it('is an outage when the runtime hides it as an opaque redirect', async () => {
      const opaque = new Response(null, { status: 200 });
      Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
      Object.defineProperty(opaque, 'status', { value: 0 });
      fetchMock.mockResolvedValue(opaque);
      await expect(proCall('/v1/pro/me', { session: 's-1' })).rejects.toThrow('redirect');
    });
  });

  it('throws ProUnauthorized on 401 when a session was sent', async () => {
    fetchMock.mockResolvedValue(reply(401));
    await expect(proCall('/v1/pro/me', { session: 's-1' })).rejects.toBeInstanceOf(ProUnauthorized);
  });

  it('returns a 401 as is when no session was sent', async () => {
    fetchMock.mockResolvedValue(reply(401));
    const out = await proCall('/v1/pro/login', { method: 'POST', body: {} });
    expect(out).toEqual({ status: 401, data: null });
  });

  it('requestLogin posts the email to /v1/pro/login', async () => {
    fetchMock.mockResolvedValue(reply(202));
    await requestLogin('a@b.co');
    const [url, init] = sent();
    expect(url).toBe('https://jobs.test/v1/pro/login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'a@b.co' });
    expect(headersOf(init).authorization).toBeUndefined();
  });

  describe('the visitor address for the sign-in throttle', () => {
    it('goes along as x-client-ip with sign-in, sign-up and the session', async () => {
      fetchMock.mockResolvedValue(reply(202));
      await requestLogin('a@b.co', '203.0.113.7');
      await requestSignup({ email: 'a@b.co', name: 'Мария', terms: true }, '2001:db8::1');
      fetchMock.mockResolvedValue(reply(200, { session: 's-1', account: {} }));
      await startSession('t-1', '198.51.100.4');
      const ips = fetchMock.mock.calls.map(([, init]) => headersOf(init)['x-client-ip']);
      expect(ips).toEqual(['203.0.113.7', '2001:db8::1', '198.51.100.4']);
    });

    it('is left out when it is not known', async () => {
      fetchMock.mockResolvedValue(reply(202));
      await requestLogin('a@b.co', null);
      await requestLogin('a@b.co');
      for (const [, init] of fetchMock.mock.calls) {
        expect(headersOf(init)).not.toHaveProperty('x-client-ip');
      }
    });

    it('never goes with a seller call', async () => {
      fetchMock.mockResolvedValue(reply(200, { email: 'a@b.co' }));
      await proCall('/v1/pro/me', { session: 's-1' });
      expect(headersOf(sent()[1])).not.toHaveProperty('x-client-ip');
    });
  });

  describe('startSession', () => {
    it('returns the session on 200', async () => {
      const good = { session: 's-1', account: { email: 'a@b.co', tone: 'vy' } };
      fetchMock.mockResolvedValue(reply(200, good));
      await expect(startSession('t-1')).resolves.toEqual(good);
    });

    it('returns null when the jobs worker refuses the link (400)', async () => {
      fetchMock.mockResolvedValue(reply(400, { error: 'invalid' }));
      await expect(startSession('used')).resolves.toBeNull();
    });

    it('throws on an outage rather than calling the link expired', async () => {
      fetchMock.mockResolvedValue(reply(503));
      await expect(startSession('t-1')).rejects.toThrow('session → 503');
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(startSession('t-1')).rejects.toThrow('fetch failed');
    });
  });

  describe('peekLogin', () => {
    it('asks whose cabinet a link opens, with the key and no session', async () => {
      fetchMock.mockResolvedValue(reply(200, { email: 'ye***@gmail.com' }));
      await expect(peekLogin('t-1')).resolves.toBe('ye***@gmail.com');
      const [url, init] = sent();
      expect(url).toBe('https://jobs.test/v1/pro/login/peek');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ token: 't-1' });
      expect(headersOf(init)['x-pro-key']).toBe('k-123');
      expect(headersOf(init).authorization).toBeUndefined();
    });

    it('returns null for a dead link (404)', async () => {
      fetchMock.mockResolvedValue(reply(404, { error: 'not found' }));
      await expect(peekLogin('used')).resolves.toBeNull();
    });

    it('throws on anything else, a 200 without an address included', async () => {
      fetchMock.mockResolvedValue(reply(503));
      await expect(peekLogin('t-1')).rejects.toThrow('peek → 503');
      fetchMock.mockResolvedValue(reply(200, { email: '' }));
      await expect(peekLogin('t-1')).rejects.toThrow('peek → 200');
      fetchMock.mockResolvedValue(reply(200, { email: 'x'.repeat(300) }));
      await expect(peekLogin('t-1')).rejects.toThrow('peek → 200');
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(peekLogin('t-1')).rejects.toThrow('fetch failed');
    });
  });

  it('says clearly what is missing', async () => {
    vi.stubEnv('PRO_API_KEY', '');
    await expect(proCall('/v1/pro/me')).rejects.toThrow(/PRO_API_KEY/);
    vi.stubEnv('PRO_API_KEY', 'k');
    vi.stubEnv('NATALKA_JOBS_URL', '');
    await expect(proCall('/v1/pro/me')).rejects.toThrow(/NATALKA_JOBS_URL/);
  });
});
