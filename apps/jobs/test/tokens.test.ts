import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { readLink, signLink, signToken, verifyToken } from '../src/crypto';
import { testEnv } from './env';
import { seedOrder } from './seed';

const KEY = 'test-link-key';
const SITE = { 'x-site-key': 'test-site-key' };
const site = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://jobs.test${path}`, {
    method,
    headers: { ...SITE, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('link tokens', () => {
  it('carry their kind, and are read back only as that kind', async () => {
    const order = await signLink('order', { order: 'o1', job: 'j1' }, KEY, 60);
    const sub = await signLink('sub', { sub: 's1' }, KEY, 60);
    const confirm = await signLink('subconfirm', { sub: 's1' }, KEY, 60);

    expect(await readLink('order', order, KEY)).toEqual({ order: 'o1', job: 'j1' });
    expect(await readLink('sub', sub, KEY)).toEqual({ sub: 's1' });
    expect(await readLink('subconfirm', confirm, KEY)).toEqual({ sub: 's1' });

    expect(await readLink('sub', order, KEY)).toBeNull();
    expect(await readLink('subconfirm', sub, KEY)).toBeNull();
    expect(await readLink('sub', confirm, KEY)).toBeNull();
    expect(await readLink('order', sub, KEY)).toBeNull();
  });

  it('read links signed before they had a kind by their shape, until they expire', async () => {
    const order = await signToken({ order: 'o1', job: 'j1' }, KEY, 60);
    const sub = await signToken({ sub: 's1' }, KEY, 60);
    expect(await readLink('order', order, KEY)).toEqual({ order: 'o1', job: 'j1' });
    expect(await readLink('sub', sub, KEY)).toEqual({ sub: 's1' });

    expect(await readLink('sub', order, KEY)).toBeNull();
    expect(await readLink('order', sub, KEY)).toBeNull();
    // A confirmation link always had a kind: an old management link never confirms anything.
    expect(await readLink('subconfirm', sub, KEY)).toBeNull();
    expect(await readLink('order', await signToken({ order: 'o1', job: 'j1' }, KEY, -10), KEY)).toBeNull();
  });

  it('refuse a kind nobody issues, a missing date and another key', async () => {
    expect(await readLink('order', await signToken({ typ: 'pro', order: 'o', job: 'j' }, KEY, 60), KEY)).toBeNull();
    expect(await readLink('order', await signToken({ order: 'o', job: 'j' }, 'another-key', 60), KEY)).toBeNull();
    // Hand-built: the same signature scheme, but no exp.
    const b64 = (value: unknown) =>
      btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ typ: 'order', order: 'o', job: 'j' });
    const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(`${head}.${body}`)));
    const sig = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await readLink('order', `${head}.${body}.${sig}`, KEY)).toBeNull();
  });

  it('turn garbage into null, never an exception', async () => {
    for (const junk of ['', 'abc', 'a.b.c', '...', 'a.b.c.d', '%%%.%%%.%%%', '!!.@@.##', 'x'.repeat(5000)]) {
      expect(await verifyToken(junk, KEY)).toBeNull();
      expect(await readLink('order', junk, KEY)).toBeNull();
    }
  });
});

describe('token routes', () => {
  it('answer 404 for a malformed or foreign token, never 500', async () => {
    const sub = await signLink('sub', { sub: crypto.randomUUID() }, KEY, 60);
    for (const token of ['a.b.c', '%25%25.x.y', 'x', sub]) {
      for (const [method, path] of [
        ['GET', `/v1/jobs/${token}`],
        ['POST', `/v1/jobs/${token}/telegram`],
        ['GET', `/d/${token}`],
      ] as const) {
        expect((await site(method, path)).status, `${method} ${path}`).toBe(404);
      }
    }
    const order = await signLink('order', { order: crypto.randomUUID(), job: crypto.randomUUID() }, KEY, 60);
    for (const token of ['a.b.c', 'x', order]) {
      expect((await site('GET', `/v1/subscriptions/${token}`)).status).toBe(404);
      expect((await site('PATCH', `/v1/subscriptions/${token}`, { cadence: 'week' })).status).toBe(404);
      expect((await site('DELETE', `/v1/subscriptions/${token}`)).status).toBe(404);
    }
  });

  it('serve an order by its own link, old and new', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Ссылка' });
    const fresh = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 60);
    const old = await signToken({ order: orderId, job: jobId }, testEnv.LINK_KEY, 60);
    for (const token of [fresh, old]) {
      const response = await site('GET', `/v1/jobs/${token}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ order_id: orderId, step: 'calc' });
    }
  });

  it('refuse a link whose job belongs to another order', async () => {
    const one = await seedOrder({ pro: false, name: 'Первый' });
    const two = await seedOrder({ pro: false, name: 'Второй' });
    const mixed = await signLink('order', { order: one.orderId, job: two.jobId }, testEnv.LINK_KEY, 60);
    expect((await site('GET', `/v1/jobs/${mixed}`)).status).toBe(404);
  });
});
