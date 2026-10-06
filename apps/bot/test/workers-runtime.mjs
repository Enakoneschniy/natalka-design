/* Preloaded by `pnpm test` (node --import): what the Workers runtime provides and Node does not.
 * `cloudflare:workers` resolves to a stand-in base class, and crypto.subtle gets the runtime's
 * timingSafeEqual (same contract: inputs of different lengths throw). */

import { timingSafeEqual } from 'node:crypto';
import { register } from 'node:module';

const workers =
  'export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }';
const hooks = `export async function resolve(specifier, context, next) {
  if (specifier !== 'cloudflare:workers') return next(specifier, context);
  return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(workers)}`)}, shortCircuit: true };
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

if (!crypto.subtle.timingSafeEqual) {
  crypto.subtle.timingSafeEqual = (a, b) => timingSafeEqual(a, b);
}
