/** Encryption for birth data and the signed link to a finished document.
 *
 * Birth data is the only personal data we keep beyond an email address, and the brief says it is
 * encrypted at rest and deleted after thirty days. AES-GCM with a key from the environment: D1
 * holds ciphertext and a nonce, and a database dump on its own tells an attacker nothing.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64url = (text: string): Uint8Array => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const aesKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    fromBase64url(secret),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

export async function encryptJson(
  value: unknown,
  secret: string,
): Promise<{ ciphertext: ArrayBuffer; nonce: ArrayBuffer }> {
  const key = await aesKey(secret);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { ciphertext, nonce: nonce.buffer as ArrayBuffer };
}

/** D1 hands a BLOB back as an array of byte values, not as an ArrayBuffer, so whatever comes out
 * of the database has to be normalised before WebCrypto will look at it. */
export type Blobish = ArrayBuffer | ArrayBufferView | number[];

const bytes = (value: Blobish): Uint8Array => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return Uint8Array.from(value);
};

export async function decryptJson<T>(
  ciphertext: Blobish,
  nonce: Blobish,
  secret: string,
): Promise<T> {
  const key = await aesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(nonce) },
    key,
    bytes(ciphertext),
  );
  return JSON.parse(decoder.decode(plain)) as T;
}

/** HS256 without a JWT library: three fields, one signature, no algorithm negotiation to get wrong. */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer as ArrayBuffer);
  const claims = base64url(encoder.encode(JSON.stringify(body)).buffer as ArrayBuffer);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64url(signature)}`;
}

/** The claims of a token we signed that has not expired, or null. Never throws: whatever arrives
 * as a token is somebody's input, and a malformed one is simply not valid. */
export async function verifyToken<T>(token: string, secret: string): Promise<T | null> {
  try {
    if (token.length > 2048) return null;
    const [header, claims, signature, ...rest] = token.split('.');
    if (!header || !claims || !signature || rest.length > 0) return null;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64url(signature) as unknown as ArrayBuffer,
      encoder.encode(`${header}.${claims}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(decoder.decode(fromBase64url(claims))) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    // Every token we sign expires; one without a date is not ours to honour.
    const exp = (payload as { exp?: unknown }).exp;
    if (typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** What a link is for. A link of one kind never works as another: a download link does not manage
 * a subscription, and a management link does not confirm one. */
export type LinkKind = 'order' | 'sub' | 'subconfirm';

export interface LinkClaims {
  order: { order: string; job: string };
  sub: { sub: string };
  subconfirm: { sub: string };
}

export const signLink = <K extends LinkKind>(
  kind: K,
  claims: LinkClaims[K],
  secret: string,
  ttlSeconds: number,
): Promise<string> => signToken({ typ: kind, ...claims }, secret, ttlSeconds);

const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

/** The claims of a link of this kind, or null. Links signed before they carried a kind are
 * recognised by their shape until they expire; a confirmation link has always carried one. */
export async function readLink<K extends LinkKind>(
  kind: K,
  token: string,
  secret: string,
): Promise<LinkClaims[K] | null> {
  const claims = await verifyToken<Record<string, unknown>>(token, secret);
  if (!claims) return null;
  const legacy = claims.typ === undefined;
  if (!legacy && claims.typ !== kind) return null;
  if (kind === 'order') {
    if (!id(claims.order) || !id(claims.job) || (legacy && claims.sub !== undefined)) return null;
    return { order: claims.order, job: claims.job } as LinkClaims[K];
  }
  if (kind === 'subconfirm' && legacy) return null;
  if (!id(claims.sub) || (legacy && (claims.order !== undefined || claims.job !== undefined))) return null;
  return { sub: claims.sub } as LinkClaims[K];
}

export const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** HMAC-SHA256 of a message, hex. A keyed hash: unlike a plain one, it cannot be matched against a
 * list of guesses by anyone without the key. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** JSON with every object's keys in sorted order and no spacing, so the same value always gives the
 * same text, and so the same hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Whether a presented secret is the configured one. Both are hashed first and the digests compared
 * in constant time, so the answer takes as long for a near miss as for a stranger and says nothing
 * about the secret's length. False when either side is missing. */
export async function sameSecret(given: string | null | undefined, expected: string | undefined): Promise<boolean> {
  if (!given || !expected) return false;
  const [a, b] = await Promise.all(
    [given, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  );
  return crypto.subtle.timingSafeEqual(a as ArrayBuffer, b as ArrayBuffer);
}

/** How long a download link stays valid: as long as the document itself is kept. */
export const LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
