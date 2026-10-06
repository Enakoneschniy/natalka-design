import { describe, expect, it } from 'vitest';
import { cleanSource, readSource } from './marketing';

describe('the source cookie', () => {
  it('is cleaned again when it is read back', () => {
    expect(readSource('Meta_Spring')).toBe('meta_spring');
    expect(readSource('"><script>alert(1)</script>')).toBe('scriptalert1script');
    expect(readSource('a'.repeat(40))).toBe('a'.repeat(24));
  });

  it('reads as nothing when nothing usable is left', () => {
    expect(readSource('<>!')).toBeNull();
    expect(readSource('')).toBeNull();
    expect(readSource(undefined)).toBeNull();
  });

  it('keeps the same rules as when it is written', () => {
    expect(readSource('TikTok.Ads-2')).toBe(cleanSource('TikTok.Ads-2'));
  });
});
