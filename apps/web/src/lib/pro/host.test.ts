import { describe, expect, it } from 'vitest';
import { isProHost } from './host';

describe('isProHost', () => {
  it('matches the default cabinet host but not the shop', () => {
    expect(isProHost('pro.chronika.me', undefined)).toBe(true);
    expect(isProHost('chronika.me', undefined)).toBe(false);
  });

  it('compares a custom list case-insensitively and exactly, port included', () => {
    const raw = 'pro.chronika.me, astro:3000';
    expect(isProHost('ASTRO:3000', raw)).toBe(true);
    expect(isProHost('astro:3001', raw)).toBe(false);
  });

  it('says no to a missing host', () => {
    expect(isProHost(null, undefined)).toBe(false);
    expect(isProHost(undefined, undefined)).toBe(false);
  });
});
