import { describe, expect, it } from 'vitest';
import { matchProxy } from './allow';

const ID = 'a1B2-c3';
const SID = 'sec-9';

describe('matchProxy', () => {
  it.each([
    ['GET', 'clients', 'json'],
    ['POST', 'clients', 'json'],
    ['GET', `clients/${ID}`, 'json'],
    ['DELETE', `clients/${ID}`, 'json'],
    ['GET', 'readings', 'json'],
    ['POST', 'readings', 'json'],
    ['GET', `readings/${ID}`, 'json'],
    ['POST', `readings/${ID}/sections/${SID}/regenerate`, 'json'],
    ['POST', `readings/${ID}/sections/${SID}/report`, 'json'],
    ['GET', `readings/${ID}/pdf`, 'pdf'],
    ['POST', `readings/${ID}/pdf`, 'json'],
    ['GET', 'demo', 'json'],
    ['GET', 'brand', 'json'],
    ['PUT', 'brand', 'json'],
    ['GET', 'brand/logo', 'image'],
    ['PUT', 'brand/logo', 'image-upload'],
    ['DELETE', 'brand/logo', 'json'],
    ['GET', 'brand/photo', 'image'],
    ['PUT', 'brand/photo', 'image-upload'],
    ['DELETE', 'brand/photo', 'json'],
    ['GET', 'purchases', 'json'],
    ['POST', 'purchases', 'json'],
    ['GET', 'me', 'json'],
    ['POST', 'invite', 'json'],
  ])('allows %s %s as %s', (method, path, kind) => {
    expect(matchProxy(method, path.split('/'))).toEqual({ path, kind });
  });

  it.each([
    ['DELETE', ['purchases']],
    ['POST', ['me']],
    ['PATCH', ['clients']],
    ['HEAD', ['me']],
    ['GET', ['orders']],
    ['POST', ['login']],
    ['POST', ['session']],
    ['POST', ['logout']],
    ['GET', ['brand', 'banner']],
    ['GET', ['clients', ID, 'extra']],
    ['GET', []],
  ])('refuses %s %j', (method, segments) => {
    expect(matchProxy(method, segments)).toBeNull();
  });

  it('refuses traversal', () => {
    expect(matchProxy('GET', ['..', 'orders'])).toBeNull();
    expect(matchProxy('GET', ['clients', '..'])).toBeNull();
    expect(matchProxy('GET', ['clients', '.'])).toBeNull();
    expect(matchProxy('GET', ['readings', ID, '..', '..', 'orders'])).toBeNull();
  });

  it('refuses an encoded slash, raw or decoded', () => {
    expect(matchProxy('GET', ['clients', 'a%2Fb'])).toBeNull();
    expect(matchProxy('GET', ['clients', 'a%2fb'])).toBeNull();
    expect(matchProxy('GET', ['clients', 'a/b'])).toBeNull();
    expect(matchProxy('GET', ['clients', '..%2F..%2Forders'])).toBeNull();
    expect(matchProxy('GET', ['clients', '%E0%A4%A'])).toBeNull();
  });

  it('refuses a bad id', () => {
    expect(matchProxy('GET', ['clients', 'a b'])).toBeNull();
    expect(matchProxy('GET', ['clients', 'a.b'])).toBeNull();
    expect(matchProxy('GET', ['clients', 'a?b'])).toBeNull();
    expect(matchProxy('GET', ['clients', ''])).toBeNull();
    expect(matchProxy('GET', ['readings', ID, 'sections', 'ü', 'regenerate'])).toBeNull();
  });

  it('refuses empty segments', () => {
    expect(matchProxy('GET', ['clients', ''])).toBeNull();
    expect(matchProxy('GET', ['', 'clients'])).toBeNull();
  });

  it('is case-sensitive on the method', () => {
    expect(matchProxy('get', ['me'])).toBeNull();
  });
});
