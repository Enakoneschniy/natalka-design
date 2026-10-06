import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, previewPayload, signedPreview, verifyPreview } from './preview';

const KEY = 'k'.repeat(32);

const facts = {
  birth: { date: '1990-05-15', time: '14:30', zone: 'Europe/Kyiv', latitude: 50.45 },
  positions: [
    { body: 'sun', longitude: 54.123456789012, house: 9 },
    { body: 'moon', longitude: -0.5, house: null },
  ],
};

describe('canonicalJson', () => {
  it('writes keys in order at every depth and keeps arrays as they are', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"e":2,"f":1}]},"b":1}',
    );
  });

  it('leaves out what JSON leaves out', () => {
    expect(canonicalJson({ a: undefined, b: [undefined, 1] })).toBe('{"b":[null,1]}');
  });
});

describe('previewPayload', () => {
  it('keeps exactly the fields the preview is written from', () => {
    expect(
      previewPayload({
        facts,
        lang: 'ru',
        gender: null,
        product: 'synastry',
        first_name: 'Анна',
        second_name: undefined,
        sig: 'x',
        model: 'something else',
      }),
    ).toEqual({ facts, lang: 'ru', product: 'synastry', first_name: 'Анна' });
  });
});

describe('signing', () => {
  beforeEach(() => vi.stubEnv('PREVIEW_KEY', KEY));
  afterEach(() => vi.unstubAllEnvs());

  it('verifies what it signed after a trip through the browser', async () => {
    const signed = await signedPreview({ facts, lang: 'ru', product: 'natal' });
    expect(signed?.sig).toMatch(/^[0-9a-f]{64}$/);
    // What the browser sends back: the same values, serialised and parsed again.
    const echoed = JSON.parse(JSON.stringify(signed)) as Record<string, unknown>;
    expect(await verifyPreview(previewPayload(echoed), echoed.sig)).toBe(true);
  });

  it('refuses anything changed, missing or made up', async () => {
    const signed = await signedPreview({
      facts,
      lang: 'ru',
      product: 'synastry',
      first_name: 'Анна',
      second_name: 'Борис',
    });
    if (!signed) throw new Error('not signed');
    const { sig, ...payload } = signed;
    expect(await verifyPreview({ ...payload, first_name: 'Мария' }, sig)).toBe(false);
    expect(await verifyPreview({ ...payload, lang: 'en' }, sig)).toBe(false);
    expect(await verifyPreview({ ...payload, facts: { ...facts, positions: [] } }, sig)).toBe(
      false,
    );
    expect(await verifyPreview(payload, undefined)).toBe(false);
    expect(await verifyPreview(payload, 'zz')).toBe(false);
    expect(await verifyPreview(payload, sig.replace(/^./, sig[0] === 'a' ? 'b' : 'a'))).toBe(false);
  });

  it('signs and verifies nothing without a key of 32 characters or more', async () => {
    const signed = await signedPreview({ facts, lang: 'ru', product: 'natal' });
    if (!signed) throw new Error('not signed');
    vi.stubEnv('PREVIEW_KEY', 'short');
    expect(await signedPreview({ facts, lang: 'ru', product: 'natal' })).toBeNull();
    const { sig, ...payload } = signed;
    expect(await verifyPreview(payload, sig)).toBe(false);
  });
});
