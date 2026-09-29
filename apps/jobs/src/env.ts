export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  JOBS: Queue<{ jobId: string }>;
  /** Base URL of the Python calculation and text API. */
  NATALKA_API_URL: string;
  RETENTION_DAYS: string;
  /** AES-GCM key (base64url, 32 bytes) for birth data. Worker secret. */
  DATA_KEY: string;
  /** HMAC secret for download links. Worker secret. */
  LINK_KEY: string;
}
