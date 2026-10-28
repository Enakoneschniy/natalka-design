/** Conversions reported to Meta from the server (the Conversions API).
 *
 * Four moments, and only for a visitor who said yes to the cookie question: they saw their own
 * chart (ViewContent), they went to pay (InitiateCheckout), the money arrived (Purchase), they
 * started a free month of horoscopes (StartTrial). Meta's pixel never runs on those pages — they
 * carry birth data — so the server is the only place these can be reported from.
 *
 * What goes with an event is what matches it to an ad click and nothing about the chart: the
 * address and the country hashed, the browser's IP address and user agent, the two cookies Meta's
 * own pixel set on the landing (_fbp, _fbc), and the product, price and order number. Never a
 * birth date, a name, a place or a gender: those belong to the person the reading is about, who is
 * often not the buyer, and they are not ours to hand to an advertiser.
 *
 * Off unless META_PIXEL_ID and META_CAPI_TOKEN are both set. A report never fails what it reports
 * on: it has a short timeout, and a refusal is logged by its status and codes and dropped.
 */

import { sha256Hex } from './crypto';
import type { Env } from './env';
import { errorCode } from './errors';

/** The Graph API version the events endpoint is called at. */
export const GRAPH_VERSION = 'v26.0';

const TIMEOUT_MS = 5000;

/** The visitor's browser, as the site's server saw it. */
export interface Browser {
  ip: string | null;
  ua: string;
  fbp: string | null;
  fbc: string | null;
}

export type MetaEventName = 'ViewContent' | 'InitiateCheckout' | 'Purchase' | 'StartTrial';

export interface MetaEvent {
  name: MetaEventName;
  /** Meta keeps one event per name and id: a webhook delivered twice is reported once. */
  id: string;
  /** The page on our site, never with its query string: the preview's carries birth data. */
  url: string;
  browser: Browser;
  email?: string | null;
  /** Ties the events of one order (or one subscription) together on Meta's side; hashed. */
  externalId?: string | null;
  country?: string | null;
  product?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  orderId?: string | null;
}

export const metaEnabled = (env: Pick<Env, 'META_PIXEL_ID' | 'META_CAPI_TOKEN'>): boolean =>
  Boolean(env.META_PIXEL_ID?.trim() && env.META_CAPI_TOKEN?.trim());

const IP = /^[0-9A-Fa-f:.]{3,45}$/;
/** fb.<subdomain index>.<creation time>.<random> — as the pixel writes them. */
const FBP = /^fb\.\d\.\d{10,13}\.\d{1,20}$/;
/** fb.<subdomain index>.<creation time>.<fbclid>; the click id is opaque, kept to URL-safe text. */
const FBC = /^fb\.\d\.\d{10,13}\.[\w.-]{1,500}$/;
const CONTROL = /[\p{Cc}]/gu;

/** The browser as the site sends it, or null when there is nothing Meta could use: a user agent is
 * required for a website event. Anything that does not look like what a browser and the pixel
 * produce is dropped, not stored and not forwarded. */
export function parseBrowser(raw: unknown): Browser | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  const ua = typeof b.ua === 'string' ? b.ua.replace(CONTROL, '').trim().slice(0, 512) : '';
  if (!ua) return null;
  const pick = (value: unknown, pattern: RegExp): string | null =>
    typeof value === 'string' && pattern.test(value) ? value : null;
  return { ip: pick(b.ip, IP), ua, fbp: pick(b.fbp, FBP), fbc: pick(b.fbc, FBC) };
}

/** Minor units to the amount Meta expects, by the currency's own number of decimals. */
export function majorUnits(amountMinor: number, currency: string): number {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // An unknown code keeps the common two decimals.
  }
  return amountMinor / 10 ** digits;
}

/** Normalised as Meta asks (trimmed, lower case), then SHA-256, hex. */
const hashed = async (value: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(value.trim().toLowerCase()).buffer as ArrayBuffer);

/** The event as Meta's endpoint takes it. */
export async function metaPayload(event: MetaEvent, time = Math.floor(Date.now() / 1000)) {
  const { browser } = event;
  const user: Record<string, unknown> = { client_user_agent: browser.ua };
  if (browser.ip) user.client_ip_address = browser.ip;
  if (browser.fbp) user.fbp = browser.fbp;
  if (browser.fbc) user.fbc = browser.fbc;
  if (event.email) user.em = [await hashed(event.email)];
  if (event.externalId) user.external_id = [await hashed(event.externalId)];
  if (event.country) user.country = [await hashed(event.country)];

  const custom: Record<string, unknown> = {};
  if (event.product) {
    custom.content_ids = [event.product];
    custom.content_type = 'product';
    custom.contents = [{ id: event.product, quantity: 1 }];
    custom.num_items = 1;
  }
  if (typeof event.amountMinor === 'number' && event.currency) {
    custom.currency = event.currency.toUpperCase();
    custom.value = majorUnits(event.amountMinor, event.currency);
  }
  if (event.orderId) custom.order_id = event.orderId;

  return {
    event_name: event.name,
    event_time: time,
    event_id: event.id,
    action_source: 'website',
    event_source_url: event.url,
    user_data: user,
    ...(Object.keys(custom).length ? { custom_data: custom } : {}),
  };
}

/** Sends one event. Never throws: whatever happens is a log line with ids and codes only. */
export async function reportToMeta(env: Env, event: MetaEvent): Promise<void> {
  if (!metaEnabled(env)) return;
  const pixel = env.META_PIXEL_ID?.trim() ?? '';
  try {
    const body: Record<string, unknown> = {
      data: [await metaPayload(event)],
      // In the body rather than the query string, so no log of a URL ever holds it.
      access_token: env.META_CAPI_TOKEN?.trim(),
    };
    const test = env.META_TEST_EVENT_CODE?.trim();
    if (test) body.test_event_code = test;
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixel)}/events`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      // The codes say what is wrong (190: the token; 100: a parameter); the message is not logged.
      const answer = (await response.json().catch(() => null)) as {
        error?: { code?: unknown; error_subcode?: unknown };
      } | null;
      const code = typeof answer?.error?.code === 'number' ? answer.error.code : '-';
      const sub = typeof answer?.error?.error_subcode === 'number' ? answer.error.error_subcode : '-';
      console.error('meta event refused', event.name, event.id, response.status, code, sub);
    }
  } catch (error) {
    console.error('meta event failed', event.name, event.id, errorCode(error));
  }
}
