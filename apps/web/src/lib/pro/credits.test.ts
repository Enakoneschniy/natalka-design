import { describe, expect, it } from 'vitest';
import { creditsLabel, creditsNoun } from './credits';

describe('creditsLabel', () => {
  it('agrees the noun with the number', () => {
    expect(creditsLabel(0)).toBe('0 кредитов');
    expect(creditsLabel(1)).toBe('1 кредит');
    expect(creditsLabel(3)).toBe('3 кредита');
    expect(creditsLabel(12)).toBe('12 кредитов');
    expect(creditsLabel(21)).toBe('21 кредит');
    expect(creditsLabel(104)).toBe('104 кредита');
  });

  it('gives the bare noun for a number shown on its own', () => {
    expect(creditsNoun(1)).toBe('кредит');
    expect(creditsNoun(3)).toBe('кредита');
    expect(creditsNoun(12)).toBe('кредитов');
  });
});
