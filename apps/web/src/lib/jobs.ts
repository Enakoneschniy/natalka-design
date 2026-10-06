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

/** Where an order's money stands. `pending` until the payment settles; `test` was never charged;
 * `refunded`, `disputed` and `failed` close it — its document is not given out. */
export const ORDER_STATUSES = [
  'pending',
  'paid',
  'test',
  'refunded',
  'disputed',
  'failed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface JobStatus {
  paid: boolean;
  /** A run that was never charged for: it must not be reported as a sale. */
  test: boolean;
  order_status: OrderStatus;
  order_id?: string;
  amount_minor: number | null;
  currency: string | null;
  step: 'calc' | 'texts' | 'pdf' | 'email' | 'done';
  status: 'queued' | 'running' | 'failed' | 'done';
  written: number;
  total: number;
  progress: number;
  /** `failed` when the run failed, never the reason. */
  error: 'failed' | null;
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

/** Only Stripe's own payment pages are sent to the browser to open. */
export const isStripeCheckout = (url: unknown): url is string =>
  typeof url === 'string' && url.startsWith('https://checkout.stripe.com/');

/** The jobs worker's answer to a call that changes something: what it made, or its status with
 * the field (a 400) or the code (a 409) it named. These are for the route to map; none of them
 * goes to the browser as it came. */
export type Outcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; field?: string; error?: string };

async function outcome<T>(response: Response): Promise<Outcome<T>> {
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const data = (await response.json().catch(() => null)) as {
    field?: unknown;
    error?: unknown;
  } | null;
  const field = typeof data?.field === 'string' ? data.field : undefined;
  const error = typeof data?.error === 'string' ? data.error : undefined;
  return {
    ok: false,
    status: response.status,
    ...(field ? { field } : {}),
    ...(error ? { error } : {}),
  };
}

export async function createOrder(order: OrderRequest): Promise<Outcome<OrderCreated>> {
  return outcome(await jobsFetch('/v1/orders', postJson(order)));
}

/** A new payment page for an order that is still unpaid: 409 `paid` or `closed` when there is
 * nothing to pay, 404 for a link that is not good. */
export async function resumeCheckout(token: string): Promise<Outcome<{ checkout_url?: unknown }>> {
  return outcome(await jobsFetch(withToken('/v1/jobs', token, '/checkout'), postJson({})));
}

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The waiting page's view of a job, built from the fields it knows and nothing else; null for a
 * link that is not good. */
export async function jobStatus(token: string): Promise<JobStatus | null> {
  const response = await jobsFetch(withToken('/v1/jobs', token));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`job status → ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  const paid = data.paid === true;
  const test = data.test === true;
  const known = (ORDER_STATUSES as readonly unknown[]).includes(data.order_status);
  return {
    paid,
    test,
    order_status: known
      ? (data.order_status as OrderStatus)
      : test
        ? 'test'
        : paid
          ? 'paid'
          : 'pending',
    ...(typeof data.order_id === 'string' ? { order_id: data.order_id } : {}),
    amount_minor: typeof data.amount_minor === 'number' ? data.amount_minor : null,
    currency: typeof data.currency === 'string' ? data.currency : null,
    step: (typeof data.step === 'string' ? data.step : 'calc') as JobStatus['step'],
    status: (typeof data.status === 'string' ? data.status : 'queued') as JobStatus['status'],
    written: number(data.written, 0),
    total: number(data.total, 0),
    progress: number(data.progress, 0),
    error: data.error ? 'failed' : null,
    pages: typeof data.pages === 'number' ? data.pages : null,
    download: typeof data.download === 'string' ? data.download : null,
  };
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
  /** `pending` until the address is confirmed; `ended` once the free month is over. */
  status: 'pending' | 'active' | 'paused' | 'cancelled' | 'ended';
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

/** Asks for a subscription. The jobs worker keeps it pending and mails a confirmation link; its
 * answer is the same 202 whoever the address belongs to, and carries no link of its own. */
export async function createSubscription(
  input: SubscriptionRequest,
): Promise<Outcome<{ status?: unknown }>> {
  return outcome(await jobsFetch('/v1/subscriptions', postJson(input)));
}

/** The confirmation link's token, traded for the subscription's management token: the first
 * confirmation starts it, a repeated one answers the same; 404 for a link that is not good. */
export async function confirmSubscription(token: string): Promise<Outcome<{ token?: unknown }>> {
  return outcome(await jobsFetch('/v1/subscriptions/confirm', postJson({ token })));
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
