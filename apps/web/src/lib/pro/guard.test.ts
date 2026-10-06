import { describe, expect, it } from 'vitest';
import { clientIp } from './guard';

const from = (ip?: string) =>
  new Request('https://pro.test/', { headers: ip === undefined ? {} : { 'cf-connecting-ip': ip } });

describe('clientIp', () => {
  it('takes the address Cloudflare saw, IPv4 or IPv6', () => {
    expect(clientIp(from('203.0.113.7'))).toBe('203.0.113.7');
    expect(clientIp(from('2001:db8::1'))).toBe('2001:db8::1');
    expect(clientIp(from('::ffff:203.0.113.7'))).toBe('::ffff:203.0.113.7');
    expect(clientIp(from(' 203.0.113.7 '))).toBe('203.0.113.7');
  });

  it('has none when the header is absent', () => {
    expect(clientIp(from())).toBeNull();
    expect(clientIp(from(''))).toBeNull();
  });

  it('passes nothing on that is not one address', () => {
    for (const raw of [
      '203.0.113.7, 198.51.100.1',
      'unknown',
      '203.0.113',
      '1.2.3.4.5',
      'abc',
      `2001:db8:${'0:'.repeat(20)}1`,
      '203.0.113.7 x',
    ]) {
      expect(clientIp(from(raw)), raw).toBeNull();
    }
  });
});
