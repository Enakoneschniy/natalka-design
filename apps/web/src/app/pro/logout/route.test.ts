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

  it('ends the session, clears the cookie and lands on sign-in', async () => {
    const res = await GET(visit('', 'same-origin'));
    expect(logout).toHaveBeenCalledWith('s-1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^chp_session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
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
    'ignores a %s link: no logout, off to the cabinet',
    async (site) => {
      const res = await GET(visit('?expired=1', site));
      expect(logout).not.toHaveBeenCalled();
      expect(res.headers.get('location')).toBe('/');
      expect(res.headers.get('set-cookie')).toBeNull();
    },
  );
});
