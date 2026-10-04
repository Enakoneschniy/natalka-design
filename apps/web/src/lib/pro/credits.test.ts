import { describe, expect, it } from 'vitest';
import { creditsLabel } from './credits';

describe('creditsLabel', () => {
  it('agrees the noun with the number', () => {
    expect(creditsLabel(0)).toBe('0 кредитов');
    expect(creditsLabel(1)).toBe('1 кредит');
    expect(creditsLabel(3)).toBe('3 кредита');
    expect(creditsLabel(12)).toBe('12 кредитов');
    expect(creditsLabel(21)).toBe('21 кредит');
    expect(creditsLabel(104)).toBe('104 кредита');
  });
});
