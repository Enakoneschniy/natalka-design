import { describe, expect, it } from 'vitest';
import { confirmOutcome } from './post';

describe('confirmOutcome', () => {
  it('tells a dead link from an outage', () => {
    expect(confirmOutcome(200)).toBe('signed-in');
    expect(confirmOutcome(400)).toBe('expired');
    expect(confirmOutcome(503)).toBe('unavailable');
  });

  it('treats anything else, offline included, as a plain retry', () => {
    expect(confirmOutcome(0)).toBe('failed');
    expect(confirmOutcome(403)).toBe('failed');
    expect(confirmOutcome(500)).toBe('failed');
  });
});
