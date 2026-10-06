import { describe, expect, it } from 'vitest';
import { cityQuery } from './cities';

describe('cityQuery', () => {
  it('makes every word a prefix', () => {
    expect(cityQuery('kyi obl')).toEqual({ match: '"kyi"* "obl"*', name: 'kyi obl' });
  });

  it('drops one-letter words and the characters that would change the search', () => {
    expect(cityQuery('Rio de "Janeiro*" a')).toEqual({
      match: '"Rio"* "de"* "Janeiro"*',
      name: 'Rio de "Janeiro*" a',
    });
  });

  it('reads at most five words of at most 64 characters', () => {
    expect(cityQuery('one two three four five six seven')?.match).toBe(
      '"one"* "two"* "three"* "four"* "five"*',
    );
    const long = `${'а'.repeat(70)} город`;
    const query = cityQuery(long);
    expect(query?.name).toHaveLength(64);
    expect(query?.match).toBe(`"${'а'.repeat(64)}"*`);
  });

  it('asks nothing for too little', () => {
    for (const raw of [null, '', ' ', 'k', 'a b c', '"*', '  x  ']) {
      expect(cityQuery(raw), String(raw)).toBeNull();
    }
  });
});
