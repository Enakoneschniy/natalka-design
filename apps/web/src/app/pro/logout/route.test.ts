import { beforeEach, describe, expect, it, vi } from 'vitest';

const logout = vi.fn();
vi.mock('@/lib/pro/client', async (original) => ({
  ...(await original<typeof import('@/lib/pro/client')>()),
  logout: (session: string) => logout(session),
}));

const { GET, POST } = await import('./route');

const HOST = 'pro.chronika.me';
const SESSION = '__Host-chp_session=s-1';

const visit = (query = '', site?: string) =>
  new Request(`https://${HOST}/pro/logout${query}`, {
    headers: { host: HOST, cookie: SESSION, ...(site ? { 'sec-fetch-site': site } : {}) },
  });

/** What the «Выйти» form sends from the cabinet's own page; `headers` overrides or drops one. */
const submit = (headers: Record<string, string | null> = {}) => {
  const merged: Record<string, string | null> = {
    host: HOST,
    cookie: SESSION,
    origin: `https://${HOST}`,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  const sent: Record<string, string> = {};
  for (const [name, value] of Object.entries(merged)) if (value !== null) sent[name] = value;
  return new Request(`https://${HOST}/pro/logout`, { method: 'POST', headers: sent, body: '' });
};

const clearsBoth = (res: Response) => {
  const [current = '', legacy = ''] = res.headers.getSetCookie();
  expect(current).toMatch(/^__Host-chp_session=;.*Max-Age=0/);
  expect(current).toMatch(/Secure/);
  expect(legacy).toMatch(/^chp_session=;.*Max-Age=0/);
};

beforeEach(() => {
  logout.mockReset().mockResolvedValue(undefined);
});

describe('GET /logout', () => {
  it('clears both cookies on this browser and lands on sign-in, without asking jobs', async () => {
    const res = await GET(visit('', 'same-origin'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
    clearsBoth(res);
    expect(logout).not.toHaveBeenCalled();
  });

  it('keeps ?expired=1 on the way to sign-in', async () => {
    const res = await GET(visit('?expired=1', 'same-origin'));
    expect(res.headers.get('location')).toBe('/login?expired=1');
    clearsBoth(res);
  });

  it('works for a typed address and for a browser that sends no Sec-Fetch-Site', async () => {
    for (const site of ['none', undefined]) {
      const res = await GET(visit('', site));
      expect(res.headers.get('location'), String(site)).toBe('/login');
      clearsBoth(res);
    }
    expect(logout).not.toHaveBeenCalled();
  });

  it.each(['cross-site', 'same-site'])(
    'ignores a %s link: no cleared cookie, off to sign-in',
    async (site) => {
      const res = await GET(visit('', site));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/login');
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(logout).not.toHaveBeenCalled();
    },
  );

  it('ends a cross-site stale-session redirect at sign-in, not back in the cabinet', async () => {
    // The cabinet layout sent a stale session here; the browser kept `cross-site` from the
    // original link. Answering `/` would bounce back to the layout and loop.
    const res = await GET(visit('?expired=1', 'cross-site'));
    expect(res.headers.get('location')).toBe('/login?expired=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('POST /logout', () => {
  it('ends the session at jobs, clears both cookies and lands on sign-in', async () => {
    const res = await POST(submit());
    expect(logout).toHaveBeenCalledWith('s-1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
    expect(res.headers.get('cache-control')).toBe('no-store');
    clearsBoth(res);
  });

  it('ends a session kept under the old cookie name too', async () => {
    await POST(submit({ cookie: 'chp_session=old' }));
    expect(logout).toHaveBeenCalledWith('old');
  });

  it('still signs out on this browser when the jobs logout fails', async () => {
    logout.mockRejectedValue(new Error('down'));
    const res = await POST(submit());
    expect(res.status).toBe(303);
    clearsBoth(res);
  });

  it('clears the cookies without calling jobs when there is no session', async () => {
    const res = await POST(submit({ cookie: null }));
    expect(logout).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    clearsBoth(res);
  });

  it('accepts a matching Origin when Sec-Fetch-Site is absent', async () => {
    const res = await POST(submit({ 'sec-fetch-site': null }));
    expect(res.status).toBe(303);
    expect(logout).toHaveBeenCalledWith('s-1');
  });

  it.each([
    ['a cross-site form', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }],
    ['a sibling subdomain', { 'sec-fetch-site': 'same-site', origin: 'https://chronika.me' }],
    [
      'a foreign Origin without Sec-Fetch-Site',
      { 'sec-fetch-site': null, origin: 'https://evil.example' },
    ],
    ['neither header', { 'sec-fetch-site': null, origin: null }],
  ])('refuses %s with 403 and signs no one out', async (_, headers) => {
    const res = await POST(submit(headers));
    expect(res.status).toBe(403);
    expect(logout).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
