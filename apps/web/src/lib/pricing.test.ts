import { describe, expect, it } from 'vitest';
import { bundlePrice, PRODUCTS, priceFor } from './pricing';

/** Every country the table knows a currency for, and one it does not. */
const COUNTRIES = ['UA', 'PL', 'CZ', 'RO', 'BG', 'GB', 'DE', 'US', 'BR', null];

describe('prices', () => {
  it('stay within what the jobs worker accepts for an order', () => {
    const prices = COUNTRIES.flatMap((country) => [
      ...PRODUCTS.map((product) => priceFor(product, country)),
      bundlePrice(country, 'a'),
      bundlePrice(country, 'b'),
      bundlePrice(country, null),
    ]);
    for (const price of prices) {
      expect(Number.isInteger(price.amount)).toBe(true);
      expect(price.amount).toBeGreaterThanOrEqual(50);
      expect(price.amount).toBeLessThanOrEqual(1_000_000);
      expect(price.currency).toMatch(/^[A-Z]{3}$/);
    }
  });
});
