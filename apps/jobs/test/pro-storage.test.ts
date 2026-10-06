import { afterEach, describe, expect, it, vi } from 'vitest';
import { putBrandImage, saveBrand } from '../src/pro/brand';
import { createClient, getClient } from '../src/pro/clients';
import { assemblePdf } from '../src/pro/lifecycle';
import { createReading, deleteClient, readingRow } from '../src/pro/readings';
import { envWith, runJob, signIn, testEnv } from './env';
import { ANNA } from './people';
import { readingFor } from './seed';

afterEach(() => vi.restoreAllMocks());

const BRAND = { name: 'Тест', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' };

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** A PNG of the given size: magic, an IHDR chunk, IEND. */
const png = (w: number, h: number) =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h),
    8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]).buffer as ArrayBuffer;

const keysUnder = async (prefix: string) => (await testEnv.DOCS.list({ prefix })).objects.map((o) => o.key).sort();
/** Lets the clock move on, so that two objects are not stored in the same millisecond. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** A seller's reading with its PDF assembled and stored, and a stray file in its folder too. */
async function readingWithFiles(name: string) {
  const reading = await readingFor(name);
  await runJob(reading.jobId);
  await saveBrand(testEnv, reading.account.id, BRAND);
  expect(await assemblePdf(testEnv, reading.account.id, reading.id)).toBe('queued');
  await runJob(reading.jobId);
  await testEnv.DOCS.put(`${reading.id}/stray.pdf`, 'left behind');
  expect((await keysUnder(`${reading.id}/`)).length).toBe(2);
  return reading;
}

describe('deleting a client', () => {
  it("deletes every file in the folders of their readings, and nobody else's", async () => {
    const { account, clientId, id } = await readingWithFiles('Файлы');
    const otherClient = await createClient(testEnv, account.id, { ...ANNA, name: 'Другая' });
    const other = (await createReading(testEnv, account, { product: 'natal', client_id: otherClient })) as { id: string };
    await testEnv.DOCS.put(`${other.id}/kept.pdf`, 'kept');

    expect(await deleteClient(testEnv, account.id, clientId)).toBe(true);
    expect(await keysUnder(`${id}/`)).toEqual([]);
    expect(await readingRow(testEnv.DB, id, account.id)).toBeNull();
    expect(await keysUnder(`${other.id}/`)).toEqual([`${other.id}/kept.pdf`]);
  });

  it('keeps the client and the readings when storage refuses, so it can be done again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { account, clientId, id } = await readingWithFiles('Отказ хранилища');
    const env = envWith('DOCS', {
      list: (options: R2ListOptions) => testEnv.DOCS.list(options),
      delete: async () => Promise.reject(new Error('storage down')),
    });
    await expect(deleteClient(env, account.id, clientId)).rejects.toThrow('storage down');
    expect(await getClient(testEnv, account.id, clientId)).not.toBeNull();
    expect(await readingRow(testEnv.DB, id, account.id)).not.toBeNull();

    expect(await deleteClient(testEnv, account.id, clientId)).toBe(true);
    expect(await keysUnder(`${id}/`)).toEqual([]);
  });

  it('looks once more after the rows are gone, for a PDF stored meanwhile', async () => {
    const { account, clientId, id } = await readingWithFiles('Поздний файл');
    const db = new Proxy(testEnv.DB, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            await testEnv.DOCS.put(`${id}/late.pdf`, 'stored while the rows were going');
            return target.batch(statements);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    expect(await deleteClient(envWith('DB', db), account.id, clientId)).toBe(true);
    expect(await keysUnder(`${id}/`)).toEqual([]);
  });
});

describe('replacing a brand picture', () => {
  it('removes every older picture of that kind, and nothing else', async () => {
    const { account } = await signIn('pictures@storage.test');
    await saveBrand(testEnv, account.id, BRAND);
    const folder = `brand/${account.id}/`;
    expect(await putBrandImage(testEnv, account.id, 'photo', png(4, 4))).toBe('ok');
    expect(await putBrandImage(testEnv, account.id, 'logo', png(8, 8))).toBe('ok');
    await testEnv.DOCS.put(`${folder}logo-stray`, 'an upload that never got its row');
    await tick();

    expect(await putBrandImage(testEnv, account.id, 'logo', png(16, 16))).toBe('ok');
    const row = await testEnv.DB.prepare('SELECT logo_key, photo_key FROM pro_brands WHERE account_id = ?')
      .bind(account.id)
      .first<{ logo_key: string; photo_key: string }>();
    expect(await keysUnder(`${folder}logo-`)).toEqual([row?.logo_key]);
    expect(await keysUnder(`${folder}photo-`)).toEqual([row?.photo_key]);
  });

  it('keeps exactly the picture the row points at when two uploads land at once', async () => {
    const { account } = await signIn('race@storage.test');
    await saveBrand(testEnv, account.id, BRAND);
    expect(await putBrandImage(testEnv, account.id, 'logo', png(8, 8))).toBe('ok');
    await tick();

    const results = await Promise.all([
      putBrandImage(testEnv, account.id, 'logo', png(10, 10)),
      putBrandImage(testEnv, account.id, 'logo', png(12, 12)),
    ]);
    expect(results).toEqual(['ok', 'ok']);
    const row = await testEnv.DB.prepare('SELECT logo_key FROM pro_brands WHERE account_id = ?')
      .bind(account.id)
      .first<{ logo_key: string }>();
    expect(await keysUnder(`brand/${account.id}/logo-`)).toEqual([row?.logo_key]);
  });
});
