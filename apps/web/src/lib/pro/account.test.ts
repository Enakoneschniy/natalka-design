import { describe, expect, it } from 'vitest';
import { closeOutcome, maskEmail, otherCabinet, sameAddress } from './account';

describe('maskEmail', () => {
  it('keeps two characters of the local part and the whole domain', () => {
    expect(maskEmail('yevhenii@gmail.com')).toBe('ye***@gmail.com');
    expect(maskEmail('ab@example.com')).toBe('ab***@example.com');
  });

  it('keeps one character when the local part has only one', () => {
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
  });

  it('masks the address as stored: trimmed and lower-case', () => {
    expect(maskEmail('  Maria@Example.COM ')).toBe('ma***@example.com');
  });

  it('gives nothing away for something that is not an address', () => {
    expect(maskEmail('nobody')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });
});

describe('otherCabinet', () => {
  it('is null when the link opens the cabinet this browser is signed in to', () => {
    expect(otherCabinet('ma***@example.com', 'maria@example.com')).toBeNull();
    expect(otherCabinet('MA***@Example.com', 'Maria@example.com')).toBeNull();
  });

  it('names the signed-in cabinet, masked, when the link opens another one', () => {
    expect(otherCabinet('ye***@gmail.com', 'maria@example.com')).toBe('ma***@example.com');
    expect(otherCabinet('ma***@gmail.com', 'maria@example.com')).toBe('ma***@example.com');
  });

  it('cannot tell apart two addresses that mask alike, and does not pretend to', () => {
    expect(otherCabinet('ma***@example.com', 'mark@example.com')).toBeNull();
  });
});

describe('sameAddress', () => {
  it('matches the cabinet address however it is typed', () => {
    expect(sameAddress(' Maria@Example.com ', 'maria@example.com')).toBe(true);
  });

  it('does not match anything else, an empty field included', () => {
    expect(sameAddress('maria@example.co', 'maria@example.com')).toBe(false);
    expect(sameAddress('', 'maria@example.com')).toBe(false);
    expect(sameAddress('   ', 'maria@example.com')).toBe(false);
  });
});

describe('closeOutcome', () => {
  it('reads what closing the cabinet came to', () => {
    expect(closeOutcome(204)).toBe('closed');
    expect(closeOutcome(400)).toBe('mismatch');
    expect(closeOutcome(401)).toBe('signed-out');
  });

  it('treats anything else, offline included, as a plain retry', () => {
    for (const status of [0, 200, 403, 409, 500, 503]) {
      expect(closeOutcome(status), String(status)).toBe('failed');
    }
  });
});
