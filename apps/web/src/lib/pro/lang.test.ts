import { describe, expect, it } from 'vitest';
import { pickLang, plural } from './lang';

describe('pickLang', () => {
  it('keeps the visitor’s own choice above everything', () => {
    expect(pickLang('ru', 'uk-UA,uk;q=0.9', 'UA')).toBe('ru');
    expect(pickLang('uk', 'ru-RU', 'DE')).toBe('uk');
  });

  it('takes the first of Ukrainian and Russian the browser asks for', () => {
    expect(pickLang(undefined, 'uk-UA,uk;q=0.9,ru;q=0.8', null)).toBe('uk');
    expect(pickLang(undefined, 'ru-RU,ru;q=0.9,uk;q=0.8', 'UA')).toBe('ru');
    expect(pickLang(undefined, 'en-US,en;q=0.9,uk;q=0.8,ru;q=0.7', null)).toBe('uk');
    // Weights, not order, say what is wanted most.
    expect(pickLang(undefined, 'ru;q=0.5,uk;q=0.8', null)).toBe('uk');
  });

  it('falls back on the country, then on Russian', () => {
    expect(pickLang(undefined, 'en-US,en;q=0.9', 'UA')).toBe('uk');
    expect(pickLang(undefined, 'en-US,en;q=0.9', 'DE')).toBe('ru');
    expect(pickLang(undefined, null, null)).toBe('ru');
  });

  it('ignores a cookie it does not know and a language refused with q=0', () => {
    expect(pickLang('en', 'uk', null)).toBe('uk');
    expect(pickLang(undefined, 'uk;q=0,ru', null)).toBe('ru');
  });
});

describe('plural', () => {
  const ru = { one: 'кредит', few: 'кредита', many: 'кредитов' };
  const uk = { one: 'кредит', few: 'кредити', many: 'кредитів' };

  it('agrees a noun with the number in each language', () => {
    expect([1, 3, 12, 21, 0].map((n) => plural('ru', n, ru))).toEqual([
      'кредит',
      'кредита',
      'кредитов',
      'кредит',
      'кредитов',
    ]);
    expect([1, 3, 12, 22, 5].map((n) => plural('uk', n, uk))).toEqual([
      'кредит',
      'кредити',
      'кредитів',
      'кредити',
      'кредитів',
    ]);
  });
});
