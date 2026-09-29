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
  /** The calculation and text API, reached over a service binding rather than the public URL. */
  API: Fetcher;
  /** The Telegram bot worker's internal entrypoint; it holds the bot token, this worker never sees it. */
  BOT: BotInternalStub;
  /** Base URL of the Python calculation and text API. */
  NATALKA_API_URL: string;
  RETENTION_DAYS: string;
  /** Where the site lives; the ready letter links back to it. */
  SITE_URL: string;
  /** Resend API key. Worker secret; absent means the ready letter is skipped, not failed. */
  RESEND_API_KEY?: string;
  /** Stripe. Worker secrets. With no secret key, orders are not accepted at all — except test
   * orders that carry TEST_ORDER_KEY, which skip payment. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** "1" once Stripe Tax is activated in the dashboard; enables automatic tax on Checkout. */
  STRIPE_TAX?: string;
  /** A test order — no payment, straight to the queue — is one whose request carries this key. */
  TEST_ORDER_KEY?: string;
  /** AES-GCM key (base64url, 32 bytes) for birth data. Worker secret. */
  DATA_KEY: string;
  /** HMAC secret for download links. Worker secret. */
  LINK_KEY: string;
}
