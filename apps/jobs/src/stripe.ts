import type { Product } from './db';
import type { Env } from './env';
import { errorCode, UpstreamError } from './errors';
import { readText } from './http';

/* Stripe, without the SDK: a few calls and a signature check.
 *
 * Checkout Sessions are created with the price inline — our price table is the source of truth,
 * there is nothing to keep in sync in Stripe's catalogue — and the webhook is verified by hand:
 * the scheme is an HMAC over "timestamp.payload", which WebCrypto does in four lines. */

const API = 'https://api.stripe.com/v1';
/** How old a webhook may be before it is treated as a replay. */
const TOLERANCE_SECONDS = 5 * 60;

/** Stripe Checkout speaks these; anything else falls back to the browser's language. */
const CHECKOUT_LOCALES = new Set(['en', 'ru', 'pl', 'cs', 'ro', 'bg', 'de', 'sk']);

/** What the payment page and the receipt call each product. Fixed here: of what the browser sent,
 * only the address reaches Stripe. */
const PRODUCT_NAMES: Record<string, Record<Product, string>> = {
  ru: {
    natal: 'Натальная карта',
    forecast: 'Прогноз на 12 месяцев',
    synastry: 'Совместимость',
    child: 'Детская карта',
    bundle: 'Натальный разбор и прогноз',
  },
  uk: {
    natal: 'Натальна карта',
    forecast: 'Прогноз на 12 місяців',
    synastry: 'Сумісність',
    child: 'Дитяча карта',
    bundle: 'Натальний розбір і прогноз',
  },
  en: {
    natal: 'Birth chart',
    forecast: '12-month forecast',
    synastry: 'Compatibility',
    child: "Child's chart",
    bundle: 'Birth chart and forecast',
  },
};

export const productName = (product: Product, locale: string): string =>
  (PRODUCT_NAMES[locale] ?? PRODUCT_NAMES.en)?.[product] ?? product;

export interface CheckoutInput {
  orderId: string;
  jobId: string;
  email: string;
  locale: string;
  currency: string;
  amountMinor: number;
  product: Product;
  /** The order's own waiting page: Stripe returns the buyer there whether they paid or not. */
  returnUrl: string;
  /** One key per session we mean to open, so a retried request cannot open two. */
  idempotencyKey: string;
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
  const name = productName(input.product, input.locale);
  const fields: Record<string, string | number | boolean> = {
    mode: 'payment',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': input.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': input.amountMinor,
    'line_items[0][price_data][product_data][name]': name,
    customer_email: input.email,
    client_reference_id: input.orderId,
    'metadata[order_id]': input.orderId,
    'metadata[job_id]': input.jobId,
    success_url: input.returnUrl,
    cancel_url: input.returnUrl,
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
    'payment_intent_data[description]': `Chronika · ${name}`,
  };
  if (env.STRIPE_TAX === '1') fields['automatic_tax[enabled]'] = true;

  const response = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': input.idempotencyKey,
    },
    body: form(fields),
  });
  if (!response.ok) return stripeFailure('checkout', response);
  const session = (await response.json()) as { id: string; url: string };
  return { id: session.id, url: session.url };
}

/** Closes a Checkout Session that should no longer take a payment. Best effort: 'complete' when it
 * already took one (the webhook may not have arrived yet), 'closed' when it can no longer be paid,
 * 'unknown' when Stripe could not be asked. */
export async function expireCheckoutSession(env: Env, sessionId: string): Promise<'closed' | 'complete' | 'unknown'> {
  const call = (path: string, method: string) =>
    fetch(`${API}/checkout/sessions/${encodeURIComponent(sessionId)}${path}`, {
      method,
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
  try {
    const expired = await call('/expire', 'POST');
    if (expired.ok) return 'closed';
    // Only an open session can be expired; ask what became of this one.
    const found = await call('', 'GET');
    if (!found.ok) return 'unknown';
    const session = (await found.json()) as { status?: string };
    if (session.status === 'complete') return 'complete';
    return session.status === 'expired' ? 'closed' : 'unknown';
  } catch (error) {
    console.error('stripe expire', errorCode(error));
    return 'unknown';
  }
}

/** Logs a refused Stripe call by status and Stripe's error code, then throws. The message is left
 * out: Stripe quotes the request back in it, the customer's address included. */
async function stripeFailure(what: string, response: Response): Promise<never> {
  let code = '';
  try {
    const body = (await response.json()) as { error?: { code?: string; type?: string } };
    code = body.error?.code ?? body.error?.type ?? '';
  } catch {
    // Not JSON: the status says enough.
  }
  console.error(`stripe ${what}`, response.status, code);
  throw new UpstreamError(`stripe ${what}`, response.status);
}

export interface PackCheckoutInput {
  purchaseId: string;
  accountId: string;
  email: string;
  pack: string;
  credits: number;
  amountMinor: number;
  currency: string;
}

/** Checkout for a credit pack. The seller pays us, so our name is on their receipt. */
export async function createPackCheckout(env: Env, input: PackCheckoutInput): Promise<CheckoutSession> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  const fields: Record<string, string | number | boolean> = {
    mode: 'payment',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': input.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': input.amountMinor,
    'line_items[0][price_data][product_data][name]': `Chronika Pro · ${input.credits} кредитов`,
    customer_email: input.email,
    client_reference_id: input.purchaseId,
    'payment_intent_data[description]': `Chronika Pro · ${input.credits} кредитов`,
    'metadata[kind]': 'pro_pack',
    'metadata[purchase_id]': input.purchaseId,
    'metadata[account_id]': input.accountId,
    'metadata[pack]': input.pack,
    success_url: `${env.PRO_SITE_URL}/credits?purchase=${input.purchaseId}`,
    cancel_url: `${env.PRO_SITE_URL}/credits`,
    locale: 'ru',
    'tax_id_collection[enabled]': true,
    'consent_collection[terms_of_service]': 'required',
    'custom_text[terms_of_service_acceptance][message]':
      'Кредиты зачисляются сразу после оплаты и не сгорают. Деньги можно вернуть в течение 14 дней, если ни один кредит пакета не потрачен.',
  };
  if (env.STRIPE_TAX === '1') fields['automatic_tax[enabled]'] = true;

  const response = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': `pack-${input.purchaseId}`,
    },
    body: form(fields),
  });
  if (!response.ok) return stripeFailure('pack checkout', response);
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
      amount_subtotal?: number;
      currency?: string;
      refunded?: boolean;
      amount_refunded?: number;
      /** A dispute's outcome: 'won', 'lost', or one of the states before. */
      status?: string;
    };
  };
}

/** No event Stripe sends comes near this; anything larger is not read. */
const MAX_EVENT_BYTES = 1024 * 1024;

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

/** The event, if the signature is Stripe's and fresh; null otherwise. While an endpoint secret is
 * being rolled Stripe signs with the old and the new one, and the header carries a v1 for each:
 * one of them matching is enough. */
export async function verifyWebhook(env: Env, request: Request): Promise<StripeEvent | null> {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  const header = request.headers.get('stripe-signature') ?? '';
  const parts = header.split(',').map((part) => {
    const at = part.indexOf('=');
    return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
  });
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key, value]) => key === 'v1' && value).map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return null;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return null;
  const payload = await readText(request, MAX_EVENT_BYTES);
  if (payload === null) return null;
  const computed = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${payload}`);
  if (!signatures.some((signature) => same(computed, signature))) return null;
  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}
