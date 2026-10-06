import { describe, expect, it } from 'vitest';
import { invalid, notFromThisOrigin, notSameOrigin, readJson } from './route';

const SHOP = 'chronika.me';

const request = (headers: Record<string, string>, body = '{}', method = 'POST') =>
  new Request(`https://${SHOP}/api/orders`, { method, headers: { host: SHOP, ...headers }, body });

describe('notSameOrigin', () => {
  it('lets a JSON request from our own page through', () => {
    expect(
      notSameOrigin(
        request({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBeNull();
    expect(
      notSameOrigin(
        request({ 'content-type': 'application/json; charset=utf-8', origin: `https://${SHOP}` }),
      ),
    ).toBeNull();
  });

  it('refuses a body that is not JSON, which a cross-site form could send', async () => {
    const refused = notSameOrigin(
      request({ 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' }),
    );
    expect(refused?.status).toBe(415);
  });

  it('refuses a request from another site, or one that cannot say where it is from', () => {
    const cases: Record<string, string>[] = [
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { origin: 'https://evil.example' },
      { origin: 'null' },
      {},
    ];
    for (const headers of cases) {
      const refused = notSameOrigin(request({ 'content-type': 'application/json', ...headers }));
      expect(refused?.status, JSON.stringify(headers)).toBe(403);
    }
  });

  it('checks only the origin for a request without a body', () => {
    const remove = (headers: Record<string, string>) =>
      new Request(`https://${SHOP}/api/subscriptions/t`, {
        method: 'DELETE',
        headers: { host: SHOP, ...headers },
      });
    expect(notFromThisOrigin(remove({ 'sec-fetch-site': 'same-origin' }))).toBeNull();
    expect(notFromThisOrigin(remove({ 'sec-fetch-site': 'cross-site' }))?.status).toBe(403);
  });
});

describe('readJson', () => {
  it('reads a JSON object', async () => {
    const read = await readJson(request({}, '{"a":1}'), 100);
    expect(read).toEqual({ ok: true, value: { a: 1 } });
  });

  it('refuses a body over the limit, by its stated length or by what arrived', async () => {
    const stated = await readJson(request({ 'content-length': '101' }, '{}'), 100);
    expect(stated.ok || stated.response.status).toBe(413);
    const arrived = await readJson(request({}, JSON.stringify({ a: 'я'.repeat(60) })), 100);
    expect(arrived.ok || arrived.response.status).toBe(413);
  });

  it('refuses what is not a JSON object', async () => {
    for (const body of ['not json', '[1,2]', '"text"', 'null']) {
      const read = await readJson(request({}, body), 100);
      expect(read.ok || read.response.status, body).toBe(400);
    }
  });
});

describe('invalid', () => {
  it('names the field', async () => {
    const answer = invalid('birth.date');
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'invalid', field: 'birth.date' });
  });
});
