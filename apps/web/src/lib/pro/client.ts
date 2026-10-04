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

export interface ProAccount {
  email: string;
  tone: string;
}

export interface ProMe extends ProAccount {
  name: string;
  balance: number;
  invite_redeemed: boolean;
}

export interface SignupInput {
  email: string;
  name: string;
  invite?: string;
  terms: boolean;
}

/** Asks for a sign-in letter. The answer is the same whoever the address belongs to. */
export async function requestLogin(email: string): Promise<void> {
  await proCall('/v1/pro/login', { method: 'POST', body: { email } });
}

/** `ok` when the letter is on its way; otherwise the reason the API gave. */
export async function requestSignup(
  input: SignupInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { status, data } = await proCall<{ error?: string } | null>('/v1/pro/signup', {
    method: 'POST',
    body: input,
  });
  if (status === 202) return { ok: true };
  return { ok: false, error: data?.error ?? `signup → ${status}` };
}

/** Trades the emailed token for a session, or null when the link is not good. */
export async function startSession(
  token: string,
): Promise<{ session: string; account: ProAccount } | null> {
  const { status, data } = await proCall<{ session: string; account: ProAccount } | null>(
    '/v1/pro/session',
    { method: 'POST', body: { token } },
  );
  return status === 200 && data ? data : null;
}

export async function me(session: string): Promise<ProMe> {
  const { status, data } = await proCall<ProMe>('/v1/pro/me', { session });
  if (status !== 200) throw new Error(`me → ${status}`);
  return data;
}

export async function logout(session: string): Promise<void> {
  await proCall('/v1/pro/logout', { method: 'POST', session });
}
