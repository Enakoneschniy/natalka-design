import { describe, expect, it } from 'vitest';
import { creditsLabel, creditsNoun } from './credits';

describe('creditsLabel', () => {
  it('agrees the noun with the number', () => {
    expect(creditsLabel(0, 'ru')).toBe('0 кредитов');
    expect(creditsLabel(1, 'ru')).toBe('1 кредит');
    expect(creditsLabel(3, 'ru')).toBe('3 кредита');
    expect(creditsLabel(12, 'ru')).toBe('12 кредитов');
    expect(creditsLabel(21, 'ru')).toBe('21 кредит');
    expect(creditsLabel(104, 'ru')).toBe('104 кредита');
  });

  it('agrees it the Ukrainian way too', () => {
    expect(creditsLabel(1, 'uk')).toBe('1 кредит');
    expect(creditsLabel(3, 'uk')).toBe('3 кредити');
    expect(creditsLabel(12, 'uk')).toBe('12 кредитів');
    expect(creditsLabel(22, 'uk')).toBe('22 кредити');
  });

  it('gives the bare noun for a number shown on its own', () => {
    expect(creditsNoun(1, 'ru')).toBe('кредит');
    expect(creditsNoun(3, 'ru')).toBe('кредита');
    expect(creditsNoun(12, 'ru')).toBe('кредитов');
    expect(creditsNoun(12, 'uk')).toBe('кредитів');
  });
});
