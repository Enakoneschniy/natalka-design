// Server-only by convention: the `server-only` package is not installed, so nothing enforces it.
/** Server-side client for the jobs Worker's seller-cabinet API (`/v1/pro/*`).
 *
 * The key and the seller's session never reach the browser; pages and route handlers call this.
 */

export class ProUnauthorized extends Error {
  constructor() {
    super('The seller session is missing or expired');
    this.name = 'ProUnauthorized';
  }
}

const config = (): { base: string; key: string } => {
  const url = process.env.NATALKA_JOBS_URL;
  const key = process.env.PRO_API_KEY;
  if (!url) throw new Error('NATALKA_JOBS_URL is not configured');
  if (!key) throw new Error('PRO_API_KEY is not configured');
  return { base: url.replace(/\/$/, ''), key };
};

export async function proCall<T>(
  path: string,
  init: { method?: string; body?: unknown; session?: string | null } = {},
): Promise<{ status: number; data: T }> {
  const { base, key } = config();
  const headers: Record<string, string> = { 'x-pro-key': key, 'content-type': 'application/json' };
  if (init.session) headers.authorization = `Bearer ${init.session}`;
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (response.status === 401 && init.session) throw new ProUnauthorized();
  const data = (await response.json().catch(() => null)) as T;
  return { status: response.status, data };
}

/** The jobs worker's raw answer, for the cabinet proxy to stream or relay as it is. `path`
 * starts with `/v1/pro/` and must come from the allowlist; the body is passed on untouched. */
export function proForward(
  path: string,
  init: { method: string; session: string; body?: BodyInit; contentType?: string },
): Promise<Response> {
  const { base, key } = config();
  const headers: Record<string, string> = {
    'x-pro-key': key,
    authorization: `Bearer ${init.session}`,
  };
  if (init.contentType) headers['content-type'] = init.contentType;
  return fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body,
    cache: 'no-store',
    // A redirect is not followed: the key and the bearer go to the jobs worker and nowhere else.
    redirect: 'manual',
  });
}

export interface ProAccount {
  email: string;
  tone: string;
}

export interface ProMe extends ProAccount {
  /** Null for a seller who never gave one; show the email instead. */
  name: string | null;
  balance: number;
  invite_redeemed: boolean;
}

export interface SignupInput {
  email: string;
  name: string;
  invite?: string;
  terms: boolean;
}

/** `ok` when the API accepted the request; otherwise its status and the reason it gave. */
export type Accepted = { ok: true } | { ok: false; status: number; error: string };

const accepted = async (path: string, body: unknown): Promise<Accepted> => {
  const { status, data } = await proCall<{ error?: string } | null>(path, { method: 'POST', body });
  if (status === 202) return { ok: true };
  // A fixed fallback: the jobs path must not reach the browser.
  return { ok: false, status, error: data?.error ?? 'invalid' };
};

/** Asks for a sign-in letter. The answer is the same whoever the address belongs to. */
export function requestLogin(email: string): Promise<Accepted> {
  return accepted('/v1/pro/login', { email });
}

/** Asks for a confirmation letter (or a sign-in letter, when the address already has a cabinet). */
export function requestSignup(input: SignupInput): Promise<Accepted> {
  return accepted('/v1/pro/signup', input);
}

/** Trades the emailed token for a session; null when the jobs worker says the link is not good
 * (400). Anything else — an outage, a status it never sends — throws, so the caller can tell a
 * dead link from a service that is down. */
export async function startSession(
  token: string,
): Promise<{ session: string; account: ProAccount } | null> {
  const { status, data } = await proCall<{ session: string; account: ProAccount } | null>(
    '/v1/pro/session',
    { method: 'POST', body: { token } },
  );
  if (status === 400) return null;
  if (status === 200 && data?.session) return data;
  throw new Error(`session → ${status}`);
}

export async function me(session: string): Promise<ProMe> {
  const { status, data } = await proCall<ProMe>('/v1/pro/me', { session });
  if (status !== 200) throw new Error(`me → ${status}`);
  return data;
}

export async function logout(session: string): Promise<void> {
  await proCall('/v1/pro/logout', { method: 'POST', session });
}
