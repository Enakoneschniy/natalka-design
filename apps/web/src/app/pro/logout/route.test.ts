import { beforeEach, describe, expect, it, vi } from 'vitest';

const readSession = vi.fn();
const logout = vi.fn();
vi.mock('@/lib/pro/session', async (original) => ({
  ...(await original<typeof import('@/lib/pro/session')>()),
  readSession: () => readSession(),
}));
vi.mock('@/lib/pro/client', async (original) => ({
  ...(await original<typeof import('@/lib/pro/client')>()),
  logout: (session: string) => logout(session),
}));

const { GET } = await import('./route');

const visit = (query = '', site?: string) =>
  new Request(`https://pro.chronika.me/pro/logout${query}`, {
    headers: { host: 'pro.chronika.me', ...(site ? { 'sec-fetch-site': site } : {}) },
  });

describe('GET /logout', () => {
  beforeEach(() => {
    readSession.mockReset().mockResolvedValue('s-1');
    logout.mockReset().mockResolvedValue(undefined);
  });

  it('ends the session, clears both cookies and lands on sign-in', async () => {
    const res = await GET(visit('', 'same-origin'));
    expect(logout).toHaveBeenCalledWith('s-1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
    const [current = '', legacy = ''] = res.headers.getSetCookie();
    expect(current).toMatch(/^__Host-chp_session=;.*Max-Age=0/);
    expect(current).toMatch(/Secure/);
    expect(legacy).toMatch(/^chp_session=;.*Max-Age=0/);
  });

  it('keeps ?expired=1 on the way to sign-in', async () => {
    const res = await GET(visit('?expired=1', 'same-origin'));
    expect(res.headers.get('location')).toBe('/login?expired=1');
  });

  it('still signs out when the jobs logout fails', async () => {
    logout.mockRejectedValue(new Error('down'));
    const res = await GET(visit('', 'none'));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('works for a browser that sends no Sec-Fetch-Site', async () => {
    const res = await GET(visit());
    expect(logout).toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('/login');
  });

  it.each(['cross-site', 'same-site'])(
    'ignores a %s link: no logout, no cleared cookie, off to sign-in',
    async (site) => {
      const res = await GET(visit('', site));
      expect(logout).not.toHaveBeenCalled();
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/login');
      expect(res.headers.get('set-cookie')).toBeNull();
    },
  );

  it('ends a cross-site stale-session redirect at sign-in, not back in the cabinet', async () => {
    // The cabinet layout sent a stale session here; the browser kept `cross-site` from the
    // original link. Answering `/` would bounce back to the layout and loop.
    const res = await GET(visit('?expired=1', 'cross-site'));
    expect(logout).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('/login?expired=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
