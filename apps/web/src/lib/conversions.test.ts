import { describe, expect, it } from 'vitest';
import { browserFrom } from './conversions';

const jar = (values: Record<string, string>) => ({
  get: (name: string) => (name in values ? { value: values[name] as string } : undefined),
});

const CHROME = 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36';

describe('browserFrom', () => {
  const list = new Headers({ 'user-agent': CHROME, 'cf-connecting-ip': '203.0.113.7' });

  it('reads the browser and the pixel’s cookies after a yes', () => {
    expect(
      browserFrom(
        list,
        jar({
          chr_consent: 'granted',
          _fbp: 'fb.1.1761600000000.42',
          _fbc: 'fb.1.1761600000000.IwAR',
        }),
      ),
    ).toEqual({
      ip: '203.0.113.7',
      ua: CHROME,
      fbp: 'fb.1.1761600000000.42',
      fbc: 'fb.1.1761600000000.IwAR',
    });
    expect(browserFrom(list, jar({ chr_consent: 'granted' }))).toEqual({
      ip: '203.0.113.7',
      ua: CHROME,
      fbp: null,
      fbc: null,
    });
  });

  it('is nothing without a yes, whatever cookies are there', () => {
    const cookies = { _fbp: 'fb.1.1761600000000.42', _fbc: 'fb.1.1761600000000.IwAR' };
    expect(browserFrom(list, jar(cookies))).toBeNull();
    expect(browserFrom(list, jar({ ...cookies, chr_consent: 'denied' }))).toBeNull();
    expect(browserFrom(list, jar({ ...cookies, chr_consent: 'yes' }))).toBeNull();
  });

  it('is nothing for a crawler or a request without a user agent', () => {
    const yes = jar({ chr_consent: 'granted' });
    expect(browserFrom(new Headers({ 'user-agent': 'Googlebot/2.1' }), yes)).toBeNull();
    expect(browserFrom(new Headers(), yes)).toBeNull();
  });
});
