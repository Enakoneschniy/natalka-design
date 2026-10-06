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

export async function verifyToken<T>(token: string, secret: string): Promise<T | null> {
  const [header, claims, signature] = token.split('.');
  if (!header || !claims || !signature) return null;
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
  const payload = JSON.parse(decoder.decode(fromBase64url(claims))) as { exp?: number };
  if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
  return payload as T;
}

export const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

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
