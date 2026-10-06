import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintVariant, readVariant, VARIANTS, variantFor } from './experiment';

describe('variantFor', () => {
  beforeEach(() => vi.stubEnv('EXPERIMENT_KEY', 'e'.repeat(32)));
  afterEach(() => vi.unstubAllEnvs());

  it('gives the same address the same side every time', async () => {
    const first = await variantFor('203.0.113.7');
    for (let i = 0; i < 5; i++) expect(await variantFor('203.0.113.7')).toBe(first);
  });

  it('splits addresses between both sides', async () => {
    const sides = new Set<string>();
    for (let i = 0; i < 64; i++) sides.add(await variantFor(`198.51.100.${i}`));
    expect([...sides].sort()).toEqual([...VARIANTS].sort());
  });

  it('depends on the key, so the split cannot be worked out from outside', async () => {
    const addresses = Array.from({ length: 32 }, (_, i) => `192.0.2.${i}`);
    const before = await Promise.all(addresses.map((address) => variantFor(address)));
    vi.stubEnv('EXPERIMENT_KEY', 'f'.repeat(32));
    const after = await Promise.all(addresses.map((address) => variantFor(address)));
    expect(after).not.toEqual(before);
  });

  it('still picks a side without an address', async () => {
    expect(VARIANTS).toContain(await variantFor(null));
  });

  it('mints a cookie that reads back as the side it was given', async () => {
    const side = await variantFor('203.0.113.7');
    expect(await readVariant((await mintVariant(side)) ?? undefined)).toBe(side);
  });
});
