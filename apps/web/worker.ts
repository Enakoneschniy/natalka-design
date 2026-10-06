/** The worker Cloudflare runs (wrangler `main`): the gate in `src/lib/edge.ts`, then the Next app
 * as OpenNext built it. `.open-next/worker.js` exists only after `opennextjs-cloudflare build`:
 * in a plain checkout (CI's typecheck, `next build`) the import is unresolved, after a build it
 * resolves untyped — so the error is ignored rather than expected. */

// biome-ignore lint/suspicious/noTsIgnore: unresolved before the OpenNext build, untyped after
// @ts-ignore
import openNext from './.open-next/worker.js';
import { gate } from './src/lib/edge';

export default {
  fetch(request, env, ctx) {
    return gate(request, env, (passed) => openNext.fetch(passed, env, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv>;

// The Durable Object classes the OpenNext build defines; an entry must export them itself.
// biome-ignore lint/suspicious/noTsIgnore: as above
// @ts-ignore
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
