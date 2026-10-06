import { beforeEach, describe, expect, it, vi } from 'vitest';

const bound: unknown[][] = [];
let cookieValue: string | undefined;

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'Mozilla/5.0', 'cf-ipcountry': 'de' }),
  cookies: async () => ({
    get: (name: string) =>
      name === 'chr_src' && cookieValue !== undefined ? { value: cookieValue } : undefined,
  }),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      DB: {
        prepare: () => ({
          bind: (...values: unknown[]) => {
            bound.push(values);
            return { run: async () => ({}) };
          },
        }),
      },
    },
    ctx: { waitUntil: () => undefined },
  }),
}));

const { count } = await import('./stats');

describe('count', () => {
  beforeEach(() => {
    bound.length = 0;
    cookieValue = undefined;
  });

  it('stores the campaign from the cookie only as a clean label', async () => {
    cookieValue = 'Meta"><img src=x>';
    await count('landing', { variant: 'a', angle: 'dates' });
    expect(bound[0]).toEqual([expect.any(String), 'landing', 'a', 'dates', 'metaimgsrcx', 'DE']);
  });

  it('stores no campaign when the cookie holds nothing usable', async () => {
    cookieValue = '<>';
    await count('start');
    expect(bound[0]?.[4]).toBe('');
  });
});
