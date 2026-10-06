/* `getCloudflareContext()` types its env as `CloudflareEnv`, which `wrangler types` writes into a
   600 kB generated file this repo does not commit. The bindings themselves belong in the repo, or
   a fresh checkout — CI, a new machine — fails to typecheck with no way to tell why. */
interface CloudflareEnv extends Env {
  /** Hosts (comma-separated) that show the seller cabinet; wrangler.jsonc `vars`. */
  PRO_HOSTS?: string;
  /** Rate limits per client address (wrangler.jsonc `ratelimits`), read by `worker.ts`. */
  RL_AUTH: RateLimit;
  RL_ORDERS: RateLimit;
  RL_PREVIEW: RateLimit;
  RL_SUBSCRIPTIONS: RateLimit;
  RL_CITIES: RateLimit;
  RL_PRO: RateLimit;
}
