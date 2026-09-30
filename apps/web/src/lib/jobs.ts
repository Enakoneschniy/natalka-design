/** Server-side client for the jobs Worker.
 *
 * The browser never sees this address: orders carry birth data and the pipeline spends money, so
 * everything goes through route handlers on our own origin.
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

const base = (): string => {
  const url = process.env.NATALKA_JOBS_URL;
  if (!url) throw new Error('NATALKA_JOBS_URL is not configured');
  return url.replace(/\/$/, '');
};

export async function createOrder(order: OrderRequest): Promise<OrderCreated> {
  const response = await fetch(`${base()}/v1/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!response.ok) {
    throw new Error(`orders → ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as OrderCreated;
}

export async function jobStatus(token: string): Promise<JobStatus | null> {
  const response = await fetch(`${base()}/v1/jobs/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as JobStatus;
}

export const documentUrl = (token: string): string => `${base()}/d/${encodeURIComponent(token)}`;

/** The code behind the "get it in Telegram" link, or null when the link has expired. */
export async function telegramCode(token: string): Promise<string | null> {
  const response = await fetch(`${base()}/v1/jobs/${encodeURIComponent(token)}/telegram`, {
    method: 'POST',
    cache: 'no-store',
  });
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
  const response = await fetch(`${base()}/v1/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`subscriptions → ${response.status}: ${await response.text()}`);
  return response.json() as Promise<{ token: string }>;
}

export async function subscriptionView(token: string): Promise<SubscriptionView | null> {
  const response = await fetch(`${base()}/v1/subscriptions/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`subscription → ${response.status}`);
  return response.json() as Promise<SubscriptionView>;
}

export async function subscriptionChange(
  token: string,
  method: 'PATCH' | 'DELETE',
  body?: { cadence?: string; status?: string },
): Promise<boolean> {
  const response = await fetch(`${base()}/v1/subscriptions/${encodeURIComponent(token)}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.ok;
}
