import { describe, expect, it } from 'vitest';
import { bundlePrice, OFFER, offerLastDay, PRODUCTS, priceFor } from './pricing';

/** Every country the table knows a currency for, and one it does not. */
const COUNTRIES = ['UA', 'PL', 'CZ', 'RO', 'BG', 'GB', 'DE', 'US', 'BR', null];

const DURING = new Date(OFFER.ends.getTime() - 1);
const AFTER = OFFER.ends;

describe('prices', () => {
  it('stay within what the jobs worker accepts for an order', () => {
    const prices = COUNTRIES.flatMap((country) => [
      ...PRODUCTS.map((product) => priceFor(product, country)),
      bundlePrice(country, DURING),
      bundlePrice(country, AFTER),
    ]);
    for (const price of prices) {
      expect(Number.isInteger(price.amount)).toBe(true);
      expect(price.amount).toBeGreaterThanOrEqual(50);
      expect(price.amount).toBeLessThanOrEqual(1_000_000);
      expect(price.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('charge the euro bundle at the higher figure of the ended test', () => {
    expect(bundlePrice('DE', AFTER)).toMatchObject({ amount: 3500, currency: 'EUR', full: null });
  });
});

describe('the offer', () => {
  it('halves the bundle in whole units, never by less than it says', () => {
    for (const country of COUNTRIES) {
      const offer = bundlePrice(country, DURING);
      const full = bundlePrice(country, AFTER);
      // The struck-through figure is exactly what the bundle costs once the offer is over.
      expect(offer.full).toEqual({
        product: 'bundle',
        currency: full.currency,
        amount: full.amount,
        formatted: full.formatted,
      });
      expect(offer.amount % 100).toBe(0);
      expect(offer.amount).toBeLessThanOrEqual((full.amount * (100 - OFFER.percent)) / 100);
      expect(offer.amount).toBeGreaterThan((full.amount * (100 - OFFER.percent)) / 100 - 100);
    }
    expect(bundlePrice('DE', DURING)).toMatchObject({ amount: 1700, formatted: '17\u00a0€' });
    expect(bundlePrice('PL', DURING).amount).toBe(5900);
  });

  it('ends at midnight after 7 November, Central European time', () => {
    expect(OFFER.ends.toISOString()).toBe('2026-11-07T23:00:00.000Z');
    expect(offerLastDay('ru')).toBe('7 ноября');
    expect(bundlePrice('DE', AFTER).full).toBeNull();
  });

  it('leaves the other products alone', () => {
    expect(priceFor('natal', 'DE').amount).toBe(1900);
  });
});
