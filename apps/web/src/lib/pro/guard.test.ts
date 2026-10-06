import { describe, expect, it } from 'vitest';
import { cappedText, clientIp, jsonBody, MAX_JSON_BYTES, overJsonCap } from './guard';

/** A POST whose body arrives in these pieces, with no `content-length` unless one is given. */
const streamed = (chunks: Uint8Array[], headers: Record<string, string> = {}) =>
  new Request('https://pro.test/', {
    method: 'POST',
    headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);

const bytes = (n: number) => new TextEncoder().encode('x'.repeat(n));

describe('the JSON cap', () => {
  it('is 64 KB', () => {
    expect(MAX_JSON_BYTES).toBe(65_536);
  });

  it('refuses a body that says it is over the cap, before reading it', () => {
    const claims = (length: string) =>
      new Request('https://pro.test/', { method: 'POST', headers: { 'content-length': length } });
    expect(overJsonCap(claims('65537'))?.status).toBe(413);
    expect(overJsonCap(claims('9999999999'))?.status).toBe(413);
    expect(overJsonCap(claims('65536'))).toBeNull();
    expect(overJsonCap(claims('2'))).toBeNull();
    expect(overJsonCap(new Request('https://pro.test/', { method: 'POST' }))).toBeNull();
  });

  it('reads a body up to the cap, and stops at the first byte past it', async () => {
    expect(await cappedText(streamed([bytes(65_536)]))).toHaveLength(65_536);
    expect(await cappedText(streamed([bytes(40_000), bytes(25_537)]))).toBeNull();
    expect(await cappedText(streamed([bytes(65_537)], { 'content-length': '2' }))).toBeNull();
  });

  it('decodes a character split between two pieces', async () => {
    const word = new TextEncoder().encode('{"name":"Мария"}');
    const split = 10; // between the two bytes of «М»
    expect(await cappedText(streamed([word.slice(0, split), word.slice(split)]))).toBe(
      '{"name":"Мария"}',
    );
  });

  it('reads an empty or missing body as empty', async () => {
    expect(await cappedText(new Request('https://pro.test/', { method: 'POST' }))).toBe('');
    expect(await cappedText(streamed([]))).toBe('');
  });
});

describe('jsonBody', () => {
  const post = (body: string) => new Request('https://pro.test/', { method: 'POST', body });

  it('is the JSON object, or null for anything else', async () => {
    expect(await jsonBody(post('{"email":"a@b.co"}'))).toEqual({ email: 'a@b.co' });
    for (const body of ['[1]', '"x"', '1', 'null', 'no', '']) {
      expect(await jsonBody(post(body)), body).toBeNull();
    }
  });

  it('is null for a body over the cap', async () => {
    expect(await jsonBody(post(`{"a":"${'x'.repeat(65_536)}"}`))).toBeNull();
  });
});

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
