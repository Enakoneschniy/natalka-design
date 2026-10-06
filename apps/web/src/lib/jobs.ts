/** Server-side client for the jobs Worker.
 *
 * The browser never sees this address: orders carry birth data and the pipeline spends money, so
 * everything goes through route handlers on our own origin. Every call carries the site key; with
 * no key configured nothing is called at all.
 */

export interface OrderRequest {
  email: string;
  product: string;
  locale: string;
  country?: string;
  amount_minor: number;
  currency: string;
  /** Which side of the price experiment the visitor was shown; kept with the order so the
   * experiment can be settled against the money rather than against a click. */
  variant?: string | null;
  /** Their answer to the cookie question, and the campaign that brought them. */
  consent?: string | null;
  source?: string | null;
  cancel_url?: string;
  product_name?: string;
  birth: BirthInput;
  /** The partner; only a synastry has one. */
  birth_second?: BirthInput;
}

export interface BirthInput {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  name: string;
  gender: 'f' | 'm' | 'n';
}

export interface OrderCreated {
  order_id: string;
  job_id: string;
  token: string;
  /** Stripe's payment page; absent while payments are not configured (test orders). */
  checkout_url?: string;
}

export interface JobStatus {
  paid: boolean;
  /** A run that was never charged for: it must not be reported as a sale. */
  test?: boolean;
  order_id?: string;
  amount_minor?: number | null;
  currency?: string | null;
  step: 'calc' | 'texts' | 'pdf' | 'email' | 'done';
  status: 'queued' | 'running' | 'failed' | 'done';
  written: number;
  total: number;
  progress: number;
  error: string | null;
  pages: number | null;
  download: string | null;
}

/** The jobs worker's address or the site key is missing: a route answers 503 and the log says
 * which. */
export class JobsNotConfigured extends Error {
  constructor(what: string) {
    super(`${what} is not configured`);
    this.name = 'JobsNotConfigured';
  }
}

const config = (): { base: string; key: string } => {
  const url = process.env.NATALKA_JOBS_URL;
  const key = process.env.SITE_KEY;
  if (!url) throw new JobsNotConfigured('NATALKA_JOBS_URL');
  if (!key) throw new JobsNotConfigured('SITE_KEY');
  return { base: url.replace(/\/$/, ''), key };
};

/** The one way to call the jobs worker. The site key goes with every call, and a redirect is not
 * followed: the key is for the jobs worker and nowhere else. */
export function jobsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { base, key } = config();
  const headers = new Headers(init.headers);
  headers.set('x-site-key', key);
  return fetch(`${base}${path}`, { cache: 'no-store', ...init, headers, redirect: 'manual' });
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const withToken = (prefix: string, token: string, suffix = '') =>
  `${prefix}/${encodeURIComponent(token)}${suffix}`;

export async function createOrder(order: OrderRequest): Promise<OrderCreated> {
  const response = await jobsFetch('/v1/orders', postJson(order));
  if (!response.ok) throw new Error(`orders → ${response.status}`);
  return (await response.json()) as OrderCreated;
}

export async function jobStatus(token: string): Promise<JobStatus | null> {
  const response = await jobsFetch(withToken('/v1/jobs', token));
  if (!response.ok) return null;
  return (await response.json()) as JobStatus;
}

/** The finished PDF as the jobs worker answers for it. */
export const fetchDocument = (token: string): Promise<Response> =>
  jobsFetch(withToken('/d', token));

/** The free preview passages, as the jobs worker answers for them. */
export const fetchPreview = (body: unknown): Promise<Response> =>
  jobsFetch('/v1/preview', postJson(body));

/** The code behind the "get it in Telegram" link, or null when the link has expired. */
export async function telegramCode(token: string): Promise<string | null> {
  const response = await jobsFetch(withToken('/v1/jobs', token, '/telegram'), { method: 'POST' });
  if (!response.ok) return null;
  const data = (await response.json()) as { code?: string };
  return data.code ?? null;
}

export interface SubscriptionRequest {
  email: string;
  locale: string;
  cadence: 'week' | 'month';
  birth: BirthInput;
}

export interface SubscriptionView {
  status: 'active' | 'paused' | 'cancelled';
  cadence: 'week' | 'month';
  email: string | null;
  locale: string;
  name: string | null;
  next_send_at: string;
  trial_ends_at: string | null;
  birth: { date: string; time: string | null; place: string } | null;
  correction_until: string | null;
  telegram_code: string;
  latest: { title: string; text: string; period: string; start: string; end: string } | null;
}

export async function createSubscription(input: SubscriptionRequest): Promise<{ token: string }> {
  const response = await jobsFetch('/v1/subscriptions', postJson(input));
  if (!response.ok) throw new Error(`subscriptions → ${response.status}`);
  return response.json() as Promise<{ token: string }>;
}

export async function subscriptionView(token: string): Promise<SubscriptionView | null> {
  const response = await jobsFetch(withToken('/v1/subscriptions', token));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`subscription → ${response.status}`);
  return response.json() as Promise<SubscriptionView>;
}

export async function subscriptionChange(
  token: string,
  method: 'PATCH' | 'DELETE',
  body?: { cadence?: string; status?: string },
): Promise<boolean> {
  const response = await jobsFetch(withToken('/v1/subscriptions', token), {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.ok;
}
