import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsNotConfigured, jobStatus, jobsFetch, telegramCode } from './jobs';

describe('jobsFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NATALKA_JOBS_URL', 'https://jobs.test/');
    vi.stubEnv('SITE_KEY', 'site-key-123');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const sent = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
    return { url, init, headers: new Headers(init.headers) };
  };

  it('sends the site key with every call and follows no redirect', async () => {
    await jobsFetch('/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const { url, init, headers } = sent();
    expect(url).toBe('https://jobs.test/v1/orders');
    expect(headers.get('x-site-key')).toBe('site-key-123');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
  });

  it('keeps the key on the calls the pages make too', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'c1' })));
    expect(await telegramCode('a.b.c')).toBe('c1');
    await jobStatus('a/b');
    expect(sent(0).url).toBe('https://jobs.test/v1/jobs/a.b.c/telegram');
    expect(sent(0).headers.get('x-site-key')).toBe('site-key-123');
    expect(sent(1).url).toBe('https://jobs.test/v1/jobs/a%2Fb');
    expect(sent(1).headers.get('x-site-key')).toBe('site-key-123');
  });

  it('calls nothing without a site key', async () => {
    vi.stubEnv('SITE_KEY', '');
    expect(() => jobsFetch('/v1/orders')).toThrow(JobsNotConfigured);
    expect(() => jobsFetch('/v1/orders')).toThrow('SITE_KEY is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls nothing without the jobs address', async () => {
    vi.stubEnv('NATALKA_JOBS_URL', '');
    await expect(jobStatus('t')).rejects.toThrow(JobsNotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
