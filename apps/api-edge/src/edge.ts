/**
 * What the edge decides on its own: who may reach the container, and what the container is told.
 *
 * Kept apart from the Worker entry, which needs the containers runtime, so that these rules run
 * under `node --test` as they are.
 */

/** The header every caller sends; the jobs Worker holds the same value as NATALKA_API_KEY. */
export const KEY_HEADER = 'x-api-key';

/** A seller's document with both brand images is well under this; nothing larger is ours. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Served without the key: CI polls the first after a deploy, the second never wakes the container. */
const OPEN_PATHS = new Set(['/health', '/edge-health']);

/** Worker secrets the Python process needs. */
export interface ModelSecrets {
  NATALKA_MODEL_API_KEY?: string;
  /** The name the key was first stored under; still accepted so it does not have to be re-entered. */
  NATALKA_ANTHROPIC_API_KEY?: string;
  NATALKA_AI_GATEWAY_URL?: string;
  /** Set once the AI Gateway requires authentication; sent only on calls to the gateway. */
  NATALKA_AI_GATEWAY_TOKEN?: string;
}

const refuse = (status: number, error: string): Response => Response.json({ error }, { status });

/** Compares two secrets in constant time. Both sides are hashed first, so neither a shared prefix
 * nor the length of the key shows in how long a wrong one takes to refuse. */
export async function sameKey(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

/** The response that turns a request away, or null when it may go through to the container. */
export async function refusal(
  request: Request,
  accessKey: string | undefined,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method === 'GET' && OPEN_PATHS.has(pathname)) return null;
  // A header value arrives trimmed; a secret typed or piped in may end in a newline.
  const expected = accessKey?.trim();
  // Fail closed: a deploy that lost the secret serves the health checks and nothing else.
  if (!expected) {
    console.error('ACCESS_KEY is not set; refusing everything but the health checks');
    return refuse(503, 'unavailable');
  }
  const given = request.headers.get(KEY_HEADER);
  if (given === null || !(await sameKey(given, expected))) return refuse(401, 'unauthorized');

  // A body has to announce its size, so an oversized one is refused before it is read; a
  // request without a body has nothing to announce.
  const length = request.headers.get('content-length');
  if (length === null) return request.body === null ? null : refuse(411, 'length required');
  if (!/^\d+$/.test(length)) return refuse(411, 'length required');
  if (Number(length) > MAX_BODY_BYTES) return refuse(413, 'too large');
  return null;
}

/** The container's environment. The model key reaches the Python process only through here — it
 * is a Worker secret, so it is encrypted at rest in Cloudflare and never written to the image. */
export function containerEnv(env: ModelSecrets): Record<string, string> {
  const vars: Record<string, string> = {
    NATALKA_MODEL_API_KEY: env.NATALKA_MODEL_API_KEY ?? env.NATALKA_ANTHROPIC_API_KEY ?? '',
    NATALKA_AI_GATEWAY_URL: env.NATALKA_AI_GATEWAY_URL ?? '',
  };
  if (env.NATALKA_AI_GATEWAY_TOKEN) vars.NATALKA_AI_GATEWAY_TOKEN = env.NATALKA_AI_GATEWAY_TOKEN;
  return vars;
}
