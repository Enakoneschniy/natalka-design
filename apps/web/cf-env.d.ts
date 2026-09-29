/* `getCloudflareContext()` types its env as `CloudflareEnv`, which `wrangler types` writes into a
   600 kB generated file this repo does not commit. The bindings themselves belong in the repo, or
   a fresh checkout — CI, a new machine — fails to typecheck with no way to tell why. */
interface CloudflareEnv extends Env {}
