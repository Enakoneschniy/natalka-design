import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../src/crypto';
import { lastRequest, testEnv } from './env';

const SITE = { 'x-site-key': 'test-site-key', 'content-type': 'application/json' };
const FACTS = { birth: { date: '1990-05-17', time: '14:30', zone: 'Europe/Kyiv' }, planets: [{ body: 'Sun', longitude: 56.1 }] };

const preview = (body: unknown) =>
  SELF.fetch('https://jobs.test/v1/preview', {
    method: 'POST',
    headers: SITE,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const seen = async (firstName: string) =>
  (await lastRequest(`/v1/preview|${firstName}`)) as { body: Record<string, unknown>; calls: number } | null;

describe('POST /v1/preview', () => {
  it('forwards only the fields the preview takes, and answers with the blocks alone', async () => {
    const response = await preview({
      facts: FACTS,
      lang: 'ru',
      gender: 'f',
      product: 'natal',
      first_name: 'Белый список',
      sig: 'signature-the-site-checks',
      email: 'someone@preview.test',
      birth: { place: 'Киев' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ blocks: [{ title: 'Солнце', text: 'Превью для Белый список' }] });

    const forwarded = (await seen('Белый список'))?.body;
    expect(Object.keys(forwarded ?? {}).sort()).toEqual(['facts', 'first_name', 'gender', 'lang', 'product']);
    expect(JSON.stringify(forwarded)).not.toContain('someone@preview.test');
    expect(JSON.stringify(forwarded)).not.toContain('signature-the-site-checks');
  });

  it('caches by every field, names included, and answers a repeat from the cache', async () => {
    const body = { facts: FACTS, lang: 'ru', first_name: 'Кэш' };
    await preview(body);
    await preview({ ...body, unrelated: 'ignored' });
    expect((await seen('Кэш'))?.calls).toBe(1);

    await preview({ ...body, first_name: 'Кэш другой' });
    expect((await seen('Кэш другой'))?.calls).toBe(1);
    await preview({ ...body, lang: 'en' });
    expect((await seen('Кэш'))?.calls).toBe(2);
  });

  it('keys the cache on the canonical JSON of exactly those fields', async () => {
    const body = { facts: { planets: [], birth: { zone: 'Europe/Kyiv', date: '1977-01-01' } }, first_name: 'Ключ', lang: 'uk' };
    await preview(body);
    const key = await sha256Hex(
      new TextEncoder().encode(
        canonicalJson({ facts: body.facts, lang: 'uk', gender: null, product: null, first_name: 'Ключ', second_name: null }),
      ).buffer as ArrayBuffer,
    );
    const row = await testEnv.DB.prepare('SELECT lang FROM previews WHERE key = ?').bind(key).first();
    expect(row).toEqual({ lang: 'uk' });
  });

  it('refuses what the preview cannot take', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ facts: undefined }, 'facts'],
      [{ facts: [] }, 'facts'],
      [{ facts: { planets: [] } }, 'facts'],
      [{ lang: 'de' }, 'lang'],
      [{ gender: 'x' }, 'gender'],
      [{ product: 'tarot' }, 'product'],
      [{ first_name: 'И'.repeat(81) }, 'first_name'],
      [{ second_name: 42 }, 'second_name'],
    ];
    for (const [patch, field] of cases) {
      const response = await preview({ facts: FACTS, lang: 'ru', ...patch });
      expect(response.status, JSON.stringify(patch)).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid', field });
    }
  });

  it('takes a synastry, whose facts carry two births', async () => {
    const response = await preview({
      facts: { first: { birth: { date: '1990-01-01' } }, second: { birth: { date: '1991-01-01' } } },
      product: 'synastry',
      first_name: 'Пара А',
      second_name: 'Пара Б',
    });
    expect(response.status).toBe(200);
    expect((await seen('Пара А'))?.body).toMatchObject({ product: 'synastry', second_name: 'Пара Б' });
  });

  it('answers 413 past 64 KB', async () => {
    const response = await preview({ facts: { ...FACTS, padding: 'x'.repeat(65 * 1024) }, lang: 'ru' });
    expect(response.status).toBe(413);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every depth and keeps arrays in order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null }, e: undefined })).toBe(
      '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}',
    );
  });
});
