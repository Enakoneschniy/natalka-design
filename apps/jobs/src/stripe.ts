import type { Env } from './env';

/* Stripe, without the SDK: two calls and a signature check.
 *
 * Checkout Sessions are created with the price inline — our price table is the source of truth,
 * there is nothing to keep in sync in Stripe's catalogue — and the webhook is verified by hand:
 * the scheme is an HMAC over "timestamp.payload", which WebCrypto does in four lines. */

const API = 'https://api.stripe.com/v1';
/** How old a webhook may be before it is treated as a replay. */
const TOLERANCE_SECONDS = 5 * 60;

/** Stripe Checkout speaks these; anything else falls back to the browser's language. */
const CHECKOUT_LOCALES = new Set(['en', 'ru', 'pl', 'cs', 'ro', 'bg', 'de', 'sk']);

export interface CheckoutInput {
  orderId: string;
  jobId: string;
  email: string;
  locale: string;
  currency: string;
  amountMinor: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

function form(fields: Record<string, string | number | boolean>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

export async function createCheckoutSession(env: Env, input: CheckoutInput): Promise<CheckoutSession> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  const fields: Record<string, string | number | boolean> = {
    mode: 'payment',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': input.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': input.amountMinor,
    'line_items[0][price_data][product_data][name]': input.productName,
    customer_email: input.email,
    client_reference_id: input.orderId,
    'metadata[order_id]': input.orderId,
    'metadata[job_id]': input.jobId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    locale: CHECKOUT_LOCALES.has(input.locale) ? input.locale : 'auto',
    // The document is made to order: a customer who pays has consented to immediate delivery
    // and knows the right of withdrawal ends with it (see the refund policy). Stripe shows the
    // consent line on the payment page as well.
    'consent_collection[terms_of_service]': 'required',
    'custom_text[terms_of_service_acceptance][message]': input.locale === 'uk'
      ? 'Документ створюється одразу після оплати; з його доставкою право на відмову припиняється.'
      : input.locale === 'ru'
        ? 'Документ создаётся сразу после оплаты; с его доставкой право на отказ прекращается.'
        : 'The document is created right after payment; the right of withdrawal ends with its delivery.',
    // Only kept for the payment; the birth data never goes to Stripe.
    'payment_intent_data[description]': `Chronika · ${input.productName}`,
  };
  if (env.STRIPE_TAX === '1') fields['automatic_tax[enabled]'] = true;

  const response = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      // One session per order, so a retried request cannot open two.
      'idempotency-key': `checkout-${input.orderId}`,
    },
    body: form(fields),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    console.error('stripe checkout', response.status, detail);
    throw new Error(`stripe answered ${response.status}`);
  }
  const session = (await response.json()) as { id: string; url: string };
  return { id: session.id, url: session.url };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      object: string;
      payment_status?: string;
      payment_intent?: string | null;
      client_reference_id?: string | null;
      metadata?: Record<string, string>;
      amount_total?: number;
      currency?: string;
    };
  };
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The event, if the signature is Stripe's and fresh; null otherwise. */
export async function verifyWebhook(env: Env, request: Request): Promise<StripeEvent | null> {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  const header = request.headers.get('stripe-signature') ?? '';
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=') as [string, string]),
  );
  const timestamp = Number(parts.t);
  const expected = parts.v1;
  if (!timestamp || !expected) return null;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return null;
  const payload = await request.text();
  const computed = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${payload}`);
  if (!same(computed, expected)) return null;
  return JSON.parse(payload) as StripeEvent;
}
