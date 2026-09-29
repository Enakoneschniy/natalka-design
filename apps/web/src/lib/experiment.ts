/* The price experiment.
 *
 * Half the visitors see one price at the paywall, half the other, and the same person sees the
 * same figure when they come back — a price that changes between visits is worse for the reader
 * than either figure, and it would make the numbers meaningless.
 *
 * The assignment is carried in a first-party cookie and signed: the price the order is charged
 * at is read from that cookie on the server, so editing it in the browser buys nothing.
 * Nothing is shared with anyone, nothing identifies a person, and the cookie does not follow
 * anybody across sites.
 */

export const VARIANTS = ['a', 'b'] as const;
export type Variant = (typeof VARIANTS)[number];

export const EXPERIMENT_COOKIE = 'cx';
/** Long enough that a visitor who thinks it over for a month sees the price they were quoted. */
export const EXPERIMENT_MAX_AGE = 60 * 60 * 24 * 60;

const encoder = new TextEncoder();

async function sign(value: string, key: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', material, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 22);
}

/** No key, no experiment: the cookie is what decides which price is charged, so a signature
 * anyone could forge is the same as no signature. Without a key the price table decides instead,
 * which is a working shop rather than a broken one. */
const key = (): string | null => {
  const configured = process.env.EXPERIMENT_KEY;
  return configured && configured.length >= 32 ? configured : null;
};

export const experimentConfigured = (): boolean => key() !== null;

/** `a.<signature>` — the variant and proof that we assigned it. */
export async function mintVariant(variant: Variant): Promise<string | null> {
  const secret = key();
  return secret ? `${variant}.${await sign(variant, secret)}` : null;
}

/** The variant a cookie carries, or null if it was edited, never set, or unverifiable. */
export async function readVariant(cookie: string | undefined): Promise<Variant | null> {
  const secret = key();
  if (!secret || !cookie) return null;
  const [variant, signature] = cookie.split('.');
  if (!variant || !signature) return null;
  if (!(VARIANTS as readonly string[]).includes(variant)) return null;
  const expected = await sign(variant, secret);
  // Constant-time enough for a value this short, and the secret is not recoverable either way.
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? (variant as Variant) : null;
}

export const randomVariant = (): Variant =>
  VARIANTS[crypto.getRandomValues(new Uint8Array(1))[0]! % VARIANTS.length] as Variant;
