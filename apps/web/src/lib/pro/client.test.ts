import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProUnauthorized, proCall, requestLogin } from './client';

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

  it('says clearly what is missing', async () => {
    vi.stubEnv('PRO_API_KEY', '');
    await expect(proCall('/v1/pro/me')).rejects.toThrow(/PRO_API_KEY/);
    vi.stubEnv('PRO_API_KEY', 'k');
    vi.stubEnv('NATALKA_JOBS_URL', '');
    await expect(proCall('/v1/pro/me')).rejects.toThrow(/NATALKA_JOBS_URL/);
  });
});
