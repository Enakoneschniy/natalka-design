import { describe, expect, it } from 'vitest';
import { activePromo, cleanCode, lookupPromo, type PromoCode, promoMaxAge } from './promo';

const XMAS: PromoCode = {
  code: 'XMAS30',
  percent: 30,
  starts: new Date('2026-11-10T00:00:00+01:00'),
  ends: new Date('2026-12-25T00:00:00+01:00'),
  note: 'test',
};
const CODES = [XMAS];
const DURING = new Date('2026-12-01T12:00:00Z');

describe('promo codes', () => {
  it('are read the way people type them', () => {
    expect(cleanCode(' xmas 30 ')).toBe('XMAS30');
    expect(cleanCode('x')).toBeNull();
    expect(cleanCode('XMAS-30')).toBeNull();
    expect(cleanCode('A'.repeat(17))).toBeNull();
    expect(cleanCode(30)).toBeNull();
  });

  it('apply from their first moment to the one before they end', () => {
    expect(lookupPromo('xmas30', DURING, CODES)).toEqual({ ok: true, promo: XMAS });
    expect(lookupPromo('XMAS30', XMAS.starts, CODES).ok).toBe(true);
    expect(lookupPromo('XMAS30', new Date(XMAS.starts.getTime() - 1), CODES)).toEqual({
      ok: false,
      reason: 'early',
    });
    expect(lookupPromo('XMAS30', XMAS.ends, CODES)).toEqual({ ok: false, reason: 'expired' });
    expect(lookupPromo('NOPE', DURING, CODES)).toEqual({ ok: false, reason: 'unknown' });
    expect(activePromo('XMAS30', XMAS.ends, CODES)).toBeNull();
  });

  it('are kept in the cookie until they end, and no longer than two months', () => {
    expect(promoMaxAge(XMAS, new Date(XMAS.ends.getTime() - 3_600_000))).toBe(3600);
    expect(promoMaxAge(XMAS, new Date('2026-01-01T00:00:00Z'))).toBe(60 * 60 * 24 * 60);
    expect(promoMaxAge(XMAS, XMAS.ends)).toBe(0);
  });
});
