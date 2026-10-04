import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createLoginToken } from '../src/pro/auth';
import { brandForDocument, parseBrand } from '../src/pro/brand';
import { testEnv } from './env';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
/** PNG magic + an IHDR chunk declaring the given size. */
const png = (w: number, h: number) =>
  new Uint8Array([...PNG_MAGIC, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 2, 0, 0, 0, 0, 0, 0, 0, ...IEND]);
/** JPEG: SOI, an APP0 segment, an SOF0 segment declaring the given size, EOI. */
const jpeg = (w: number, h: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, ...u16(h), ...u16(w), 1, 1, 0x11, 0, 0xff, 0xd9]);
const PNG = png(8, 8);
const JPEG = jpeg(8, 8);

async function session(name: string) {
  const token = await createLoginToken(testEnv.DB, `${name}@brand.test`);
  const r = await SELF.fetch('https://jobs.test/v1/pro/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key' },
    body: JSON.stringify({ token }),
  });
  return ((await r.json()) as { session: string }).session;
}

const call = (method: string, path: string, s: string, body?: BodyInit, type = 'application/json') =>
  SELF.fetch(`https://jobs.test${path}`, {
    method,
    headers: { 'content-type': type, 'x-pro-key': 'test-pro-key', authorization: `Bearer ${s}` },
    body,
  });

const BRAND = { name: '  Мария Звёздная ', contacts: ['@maria'], accent: '#8E7CC3', intro: 'Привет', outro: '', signature: 'М.' };

describe('parseBrand', () => {
  it('trims and defaults', () => {
    expect(parseBrand({ name: ' X ' })).toEqual({ name: 'X', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' });
  });
  it('refuses what does not fit', () => {
    for (const bad of [{}, { name: '' }, { name: 'x'.repeat(61) }, { name: 'X', accent: 'red' }, { name: 'X', contacts: ['1', '2', '3', '4', '5'] }, { name: 'X', contacts: [''] }, { name: 'X', intro: 'x'.repeat(3001) }]) {
      expect(parseBrand(bad)).toBeNull();
    }
  });
});

describe('/v1/pro/brand', () => {
  it('saves a brand, its tone, its images, and builds the document brand', async () => {
    const s = await session('maria');
    expect(await (await call('GET', '/v1/pro/brand', s)).json()).toEqual({ brand: null, tone: 'vy' });
    expect((await call('PUT', '/v1/pro/brand/logo', s, PNG, 'image/png')).status).toBe(409);
    expect((await call('PUT', '/v1/pro/brand', s, JSON.stringify({ ...BRAND, tone: 'ty' }))).status).toBe(200);
    expect((await call('PUT', '/v1/pro/brand/logo', s, PNG, 'image/png')).status).toBe(200);
    expect((await call('PUT', '/v1/pro/brand/photo', s, JPEG, 'image/jpeg')).status).toBe(200);

    const got = (await (await call('GET', '/v1/pro/brand', s)).json()) as { brand: { name: string; has_logo: boolean }; tone: string };
    expect(got).toMatchObject({ tone: 'ty', brand: { name: 'Мария Звёздная', has_logo: true, has_photo: true } });
    const logo = await call('GET', '/v1/pro/brand/logo', s);
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(logo.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await logo.arrayBuffer())).toEqual(PNG);

    const account = await testEnv.DB.prepare("SELECT id FROM pro_accounts WHERE email = 'maria@brand.test'").first<{ id: string }>();
    const doc = await brandForDocument(testEnv, account!.id);
    expect(doc).toMatchObject({ name: 'Мария Звёздная', contacts: ['@maria'], accent: '#8E7CC3' });
    expect(atob(doc!.logo!).charCodeAt(0)).toBe(0x89);
  });

  it('replaces an image and forgets the old object', async () => {
    const s = await session('replace');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    await call('PUT', '/v1/pro/brand/logo', s, PNG, 'image/png');
    const account = await testEnv.DB.prepare("SELECT id FROM pro_accounts WHERE email = 'replace@brand.test'").first<{ id: string }>();
    const first = await testEnv.DB.prepare('SELECT logo_key FROM pro_brands WHERE account_id = ?').bind(account!.id).first<{ logo_key: string }>();
    await call('PUT', '/v1/pro/brand/logo', s, JPEG, 'image/jpeg');
    expect(await testEnv.DOCS.get(first!.logo_key)).toBeNull();
    expect((await call('DELETE', '/v1/pro/brand/logo', s)).status).toBe(200);
    expect((await call('GET', '/v1/pro/brand/logo', s)).status).toBe(404);
  });

  it('refuses what is not a PNG or JPEG, or too large', async () => {
    const s = await session('refuse');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    expect((await call('PUT', '/v1/pro/brand/logo', s, new TextEncoder().encode('GIF89a'), 'image/png')).status).toBe(400);
    const big = new Uint8Array(1_048_577);
    big.set(PNG);
    expect((await call('PUT', '/v1/pro/brand/logo', s, big, 'image/png')).status).toBe(400);
    expect((await call('GET', '/v1/pro/brand/logo', s)).status).toBe(404);
  });

  it('refuses an image past 4000 px on a side, and a JPEG with no frame header', async () => {
    const s = await session('pixels');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    expect((await call('PUT', '/v1/pro/brand/logo', s, png(5000, 10), 'image/png')).status).toBe(400);
    expect((await call('PUT', '/v1/pro/brand/photo', s, jpeg(10, 5000), 'image/jpeg')).status).toBe(400);
    expect((await call('PUT', '/v1/pro/brand/photo', s, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]), 'image/jpeg')).status).toBe(400);
    expect((await call('PUT', '/v1/pro/brand/logo', s, png(4000, 4000), 'image/png')).status).toBe(200);
  });

  it('refuses an image that is not whole', async () => {
    const s = await session('whole');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    expect((await call('PUT', '/v1/pro/brand/logo', s, PNG.slice(0, PNG.length - 12), 'image/png')).status).toBe(400);
    const wrongFirst = PNG.slice();
    wrongFirst.set([0x74, 0x45, 0x58, 0x74], 12);
    expect((await call('PUT', '/v1/pro/brand/logo', s, wrongFirst, 'image/png')).status).toBe(400);
    expect((await call('PUT', '/v1/pro/brand/photo', s, JPEG.slice(0, JPEG.length - 2), 'image/jpeg')).status).toBe(400);
  });

  it('refuses an oversize content-length before reading the body', async () => {
    const s = await session('declared');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    const r = await SELF.fetch('https://jobs.test/v1/pro/brand/logo', {
      method: 'PUT',
      headers: { 'x-pro-key': 'test-pro-key', authorization: `Bearer ${s}`, 'content-length': '2000000' },
      body: PNG,
    });
    expect(r.status).toBe(400);
  });

  it('refuses a bad brand and a bad tone', async () => {
    const s = await session('badbrand');
    expect((await call('PUT', '/v1/pro/brand', s, JSON.stringify({ name: '' }))).status).toBe(400);
    expect((await call('PUT', '/v1/pro/brand', s, JSON.stringify({ ...BRAND, tone: 'они' }))).status).toBe(400);
  });
});
