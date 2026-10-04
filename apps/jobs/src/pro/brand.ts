/** A seller's brand: their name, contacts, colour, words, and two pictures.
 *
 * A brand is the seller's own presentation, not data about their clients, so it is stored in the
 * clear. Pictures live in R2 under brand/<account_id>/; the row keeps their keys. A picture is
 * accepted only when both its magic bytes and its declared pixel size check out.
 */

import { now } from '../db';
import type { Env } from '../env';

export interface BrandInput {
  name: string;
  contacts: string[];
  accent: string;
  intro: string;
  outro: string;
  signature: string;
}

/** The exact JSON of the renderer's `Brand` model. */
export interface DocumentBrand extends BrandInput {
  logo: string | null;
  photo: string | null;
}

export type ImageKind = 'logo' | 'photo';

const DEFAULT_ACCENT = '#E7B75C';
const ACCENT = /^#[0-9A-Fa-f]{6}$/;
const MAX_IMAGE_BYTES = 1_048_576;
const MAX_SIDE = 4000;

const trimmed = (value: unknown, max: number, required = false): string | null => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length <= max && (!required || t.length > 0) ? t : null;
};

/** A brand from untrusted input, or null when any part does not fit. */
export function parseBrand(raw: unknown): BrandInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const name = trimmed(b.name, 60, true);
  const intro = trimmed(b.intro, 3000);
  const outro = trimmed(b.outro, 3000);
  const signature = trimmed(b.signature, 80);
  if (name === null || intro === null || outro === null || signature === null) return null;

  let accent = DEFAULT_ACCENT;
  if (b.accent !== undefined) {
    if (typeof b.accent !== 'string') return null;
    accent = b.accent.trim();
    if (!ACCENT.test(accent)) return null;
  }

  let contacts: string[] = [];
  if (b.contacts !== undefined) {
    if (!Array.isArray(b.contacts) || b.contacts.length > 4) return null;
    for (const item of b.contacts) {
      const line = trimmed(item, 80, true);
      if (line === null) return null;
      contacts.push(line);
    }
  }
  return { name, contacts, accent, intro, outro, signature };
}

export async function saveBrand(env: Env, accountId: string, input: BrandInput): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pro_brands (account_id, name, contacts, accent, intro, outro, signature, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       name = excluded.name, contacts = excluded.contacts, accent = excluded.accent,
       intro = excluded.intro, outro = excluded.outro, signature = excluded.signature,
       updated_at = excluded.updated_at`,
  )
    .bind(accountId, input.name, JSON.stringify(input.contacts), input.accent, input.intro, input.outro, input.signature, now())
    .run();
}

interface BrandRow {
  name: string;
  contacts: string;
  accent: string;
  intro: string;
  outro: string;
  signature: string;
  logo_key: string | null;
  photo_key: string | null;
}

const brandRow = (env: Env, accountId: string): Promise<BrandRow | null> =>
  env.DB.prepare(
    'SELECT name, contacts, accent, intro, outro, signature, logo_key, photo_key FROM pro_brands WHERE account_id = ?',
  )
    .bind(accountId)
    .first<BrandRow>();

const inputOf = (row: BrandRow): BrandInput => ({
  name: row.name,
  contacts: JSON.parse(row.contacts) as string[],
  accent: row.accent,
  intro: row.intro,
  outro: row.outro,
  signature: row.signature,
});

export async function getBrand(
  env: Env,
  accountId: string,
): Promise<(BrandInput & { has_logo: boolean; has_photo: boolean }) | null> {
  const row = await brandRow(env, accountId);
  if (!row) return null;
  return { ...inputOf(row), has_logo: row.logo_key !== null, has_photo: row.photo_key !== null };
}

/** The content type and pixel size an image declares, or null when it is not a PNG/JPEG. */
function inspectImage(bytes: Uint8Array): { type: string; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 24 && PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1] as number;
      if (marker === 0xff) {
        at += 1; // fill byte
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        if (at + 9 > bytes.length) return null;
        return { type: 'image/jpeg', height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2; // standalone markers carry no length
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null; // end, or scan data, before any frame header
      at += 2 + view.getUint16(at + 2);
    }
  }
  return null;
}

const column = (kind: ImageKind): 'logo_key' | 'photo_key' => (kind === 'logo' ? 'logo_key' : 'photo_key');

export async function putBrandImage(
  env: Env,
  accountId: string,
  kind: ImageKind,
  bytes: ArrayBuffer,
): Promise<'ok' | 'no_brand' | 'invalid'> {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return 'invalid';
  const image = inspectImage(new Uint8Array(bytes));
  if (!image || image.width < 1 || image.height < 1 || image.width > MAX_SIDE || image.height > MAX_SIDE) {
    return 'invalid';
  }
  const row = await brandRow(env, accountId);
  if (!row) return 'no_brand';

  const previous = row[column(kind)];
  const key = `brand/${accountId}/${kind}-${crypto.randomUUID()}`;
  await env.DOCS.put(key, bytes, { httpMetadata: { contentType: image.type } });
  await env.DB.prepare(`UPDATE pro_brands SET ${column(kind)} = ?, updated_at = ? WHERE account_id = ?`)
    .bind(key, now(), accountId)
    .run();
  if (previous) await env.DOCS.delete(previous);
  return 'ok';
}

export async function deleteBrandImage(env: Env, accountId: string, kind: ImageKind): Promise<void> {
  const row = await brandRow(env, accountId);
  const key = row?.[column(kind)];
  if (!key) return;
  await env.DB.prepare(`UPDATE pro_brands SET ${column(kind)} = NULL, updated_at = ? WHERE account_id = ?`)
    .bind(now(), accountId)
    .run();
  await env.DOCS.delete(key);
}

export async function brandImage(
  env: Env,
  accountId: string,
  kind: ImageKind,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const key = (await brandRow(env, accountId))?.[column(kind)];
  if (!key) return null;
  const object = await env.DOCS.get(key);
  if (!object) return null;
  return { body: object.body, contentType: object.httpMetadata?.contentType ?? 'application/octet-stream' };
}

/** Base64 in slices, so a megabyte image never goes through one giant spread. */
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function encodedImage(env: Env, key: string | null): Promise<string | null> {
  if (!key) return null;
  const object = await env.DOCS.get(key);
  return object ? base64(new Uint8Array(await object.arrayBuffer())) : null;
}

export async function brandForDocument(env: Env, accountId: string): Promise<DocumentBrand | null> {
  const row = await brandRow(env, accountId);
  if (!row) return null;
  return {
    ...inputOf(row),
    logo: await encodedImage(env, row.logo_key),
    photo: await encodedImage(env, row.photo_key),
  };
}

export async function setTone(env: Env, accountId: string, tone: 'vy' | 'ty'): Promise<void> {
  await env.DB.prepare('UPDATE pro_accounts SET tone = ? WHERE id = ?').bind(tone, accountId).run();
}
