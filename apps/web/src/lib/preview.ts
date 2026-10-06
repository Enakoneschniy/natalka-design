/** The free preview, signed for what the page rendered.
 *
 * The preview page draws the chart on the server and the browser then asks for the passages
 * about it. What the browser sends back is signed here first — the facts, the language, the
 * product and the names — so `/api/preview` writes about charts this site drew and nothing else,
 * and the signature itself never leaves the site.
 */

/** Exactly the fields the passages are written from. */
export const PREVIEW_FIELDS = [
  'facts',
  'lang',
  'gender',
  'product',
  'first_name',
  'second_name',
] as const;

export interface PreviewPayload {
  facts: unknown;
  lang: string;
  gender?: string;
  product?: string;
  first_name?: string;
  second_name?: string;
}

export type SignedPreview = PreviewPayload & { sig: string };

/** JSON with the keys of every object in order, so the same values always give the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The preview fields of a request, and only those; an empty one (null, undefined) is left out,
 * which is also how the browser's JSON leaves it. */
export function previewPayload(input: Record<string, unknown>): PreviewPayload {
  const payload: Record<string, unknown> = {};
  for (const field of PREVIEW_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== null) payload[field] = value;
  }
  return payload as unknown as PreviewPayload;
}

const encoder = new TextEncoder();

/** No key, no preview: a signature anyone could forge is the same as none. */
function previewKey(): string | null {
  const key = process.env.PREVIEW_KEY;
  return key && key.length >= 32 ? key : null;
}

export const previewConfigured = (): boolean => previewKey() !== null;

const importKey = (key: string, use: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    use,
  ]);

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** The payload the page hands the browser, with its signature; null when no key is configured. */
export async function signedPreview(input: PreviewPayload): Promise<SignedPreview | null> {
  const key = previewKey();
  if (!key) {
    console.error('preview: PREVIEW_KEY is not configured');
    return null;
  }
  const payload = previewPayload(input as unknown as Record<string, unknown>);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importKey(key, 'sign'),
    encoder.encode(canonicalJson(payload)),
  );
  return { ...payload, sig: hex(signature) };
}

/** True when `sig` is this site's signature of exactly this payload. The comparison is
 * WebCrypto's own, which takes the same time whatever the signature says. */
export async function verifyPreview(payload: PreviewPayload, sig: unknown): Promise<boolean> {
  const key = previewKey();
  if (!key || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(sig.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.verify(
    'HMAC',
    await importKey(key, 'verify'),
    bytes,
    encoder.encode(canonicalJson(payload)),
  );
}
