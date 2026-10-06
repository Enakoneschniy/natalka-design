import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmOutcome, putImage, sendJson } from './post';

describe('sendJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => {
    const fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const out = await sendJson('/api/pro/x/clients/c-1', method, body);
    return { out, init: (fetch.mock.calls[0] as unknown as [string, RequestInit])[1] };
  };

  it('sends a mutation its JSON', async () => {
    const { out, init } = await call('POST', { name: 'Анна' });
    expect(out).toEqual({ status: 200, data: { ok: true } });
    expect(init).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Анна"}',
    });
  });

  it('gives a bodyless DELETE an empty object, so it goes with a length', async () => {
    const { init } = await call('DELETE');
    expect(init.body).toBe('{}');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('sends a GET without a body', async () => {
    const { init } = await call('GET');
    expect(init.body).toBeUndefined();
  });
});

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

describe('putImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the file itself with its own content type', async () => {
    const fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    expect(await putImage('/api/pro/x/brand/logo', file)).toEqual({ status: 200 });
    expect(fetch).toHaveBeenCalledWith('/api/pro/x/brand/logo', {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
  });

  it('passes the error on, and reports offline as 0', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"no_brand"}', { status: 409 }));
    const file = new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' });
    expect(await putImage('/api/pro/x/brand/photo', file)).toEqual({
      status: 409,
      error: 'no_brand',
    });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await putImage('/api/pro/x/brand/photo', file)).toEqual({ status: 0 });
  });
});
