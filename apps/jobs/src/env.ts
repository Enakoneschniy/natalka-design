export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  JOBS: Queue<{ jobId: string }>;
  /** The calculation and text API, reached over a service binding rather than the public URL. */
  API: Fetcher;
  /** Base URL of the Python calculation and text API. */
  NATALKA_API_URL: string;
  RETENTION_DAYS: string;
  /** Where the site lives; the ready letter links back to it. */
  SITE_URL: string;
  /** Resend API key. Worker secret; absent means the ready letter is skipped, not failed. */
  RESEND_API_KEY?: string;
  /** AES-GCM key (base64url, 32 bytes) for birth data. Worker secret. */
  DATA_KEY: string;
  /** HMAC secret for download links. Worker secret. */
  LINK_KEY: string;
}
