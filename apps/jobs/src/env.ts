/** What the bot exposes over its binding (see apps/bot). Typed by hand: the two workers do not
 * share a build. */
export interface BotInternalStub {
  deliver(args: { chatId: number; code: string; locale: string; token: string }): Promise<void>;
  sendHoroscope(args: { chatId: number; locale: string; title: string; text: string }): Promise<void>;
}

/** A queue message names either a document job or a subscription whose horoscope is due. */
export type QueueMessage = { jobId: string } | { subscriptionId: string };

export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  JOBS: Queue<QueueMessage>;
  /** The text-and-document API, reached over a service binding rather than the public URL. */
  API: Fetcher;
  /** The public ephemeris service — same account, so a binding rather than a public fetch. */
  EPHEMERIS: Fetcher;
  /** The Telegram bot worker's internal entrypoint; it holds the bot token, this worker never sees it. */
  BOT: BotInternalStub;
  /** Base URL of the Python calculation and text API. */
  NATALKA_API_URL: string;
  /** Sent as x-api-key on every call to that API. Worker secret, the same value as the API
   * edge's ACCESS_KEY. Unset, no call is made: jobs fail and previews answer 503. */
  NATALKA_API_KEY?: string;
  /** Days a document, the birth data and the texts written from it are kept. A var. */
  RETENTION_DAYS: string;
  /** Where the site lives; the ready letter, Stripe's return and the subscription letters link
   * back to it. */
  SITE_URL: string;
  /** Resend API key. Worker secret; absent means letters are skipped, not failed. */
  RESEND_API_KEY?: string;
  /** Where owner alerts go (refunds to make, disputes, failed documents). A var; help@chronika.me
   * when unset. Alerts carry ids and status codes only. */
  ALERT_EMAIL?: string;
  /** "1" only on a developer's machine: the sign-in and confirmation links in letters are also
   * written to the log. Never set in wrangler.jsonc or in production. */
  MAIL_LOG_LINKS?: string;
  /** Stripe. Worker secrets. With no secret key, orders are refused with 503 — except test orders
   * that carry TEST_ORDER_KEY, which skip payment. Without the webhook secret every event is
   * refused as unsigned. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** "1" once Stripe Tax is activated in the dashboard; enables automatic tax on Checkout. A var,
   * declared "0" in wrangler.jsonc: the owner decides when to switch it on. */
  STRIPE_TAX?: string;
  /** A test order — no payment, straight to the queue — is one whose request carries this key in
   * x-test-order. Worker secret. */
  TEST_ORDER_KEY?: string;
  /** "1" only on a developer's machine without Stripe: every order is a free test order. Never
   * set in wrangler.jsonc or in production, where an order without Stripe is refused with 503. */
  ALLOW_FREE_ORDERS?: string;
  /** AES-GCM key (base64url, 32 bytes) for everything kept encrypted: birth data, job payloads,
   * subscription charts, sellers' clients. Worker secret. */
  DATA_KEY: string;
  /** HMAC secret for the links in letters and on the site (order, subscription, confirmation) and
   * for the keyed hash of addresses the letter limit counts by. Worker secret. */
  LINK_KEY: string;
  /** HMAC secret for Chronika Pro sessions. Worker secret; never the same value as LINK_KEY, so a
   * download link can never be replayed as a session. */
  SESSION_KEY: string;
  /** Shared secret for /v1/pro/*. Worker secret: the pro site's server sends it as x-pro-key; the
   * browser never has it. */
  PRO_API_KEY: string;
  /** Shared secret for every other route but /health and the Stripe webhook. Worker secret, the
   * same value as the site's SITE_KEY: the site's server sends it as x-site-key. Unset, those
   * routes answer 503. */
  SITE_KEY?: string;
  /** Where the seller cabinet lives; sign-in letters link to it. */
  PRO_SITE_URL: string;
  /** The order of the sample reading every seller can open before they have credits. Optional:
   * without it the demo route answers 404. */
  PRO_DEMO_ORDER_ID?: string;
}
