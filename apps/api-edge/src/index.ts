/**
 * Edge wrapper for the Python calculation API.
 *
 * The engine depends on pyswisseph (a C extension), which cannot run on the Workers runtime, so it
 * lives in a Cloudflare Container. This Worker is the public entry point: it proxies requests to the
 * container, keeps one warm instance per region and answers health checks without waking it.
 */
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  API_CONTAINER: DurableObjectNamespace<ApiContainer>;
  ALLOWED_ORIGINS: string;
  /** Set with `wrangler secret put`; never present in the repository. */
  NATALKA_ANTHROPIC_API_KEY?: string;
}

export class ApiContainer extends Container {
  defaultPort = 8000;
  /** Shut the instance down after idling; the next request cold-starts it (~2–4 s). */
  sleepAfter = '15m';

  /** The model key reaches the Python process only through here — it is a Worker secret, so it
   * is encrypted at rest in Cloudflare and never written to the image or the repository. */
  override envVars: Record<string, string> = {
    NATALKA_ANTHROPIC_API_KEY: (this.env as Env).NATALKA_ANTHROPIC_API_KEY ?? '',
  };

  override onStart() {
    console.log('container started');
  }

  override onError(error: unknown) {
    console.error('container error', error);
    return new Response('calculation service unavailable', { status: 503 });
  }
}

const CORS_METHODS = 'GET,POST,OPTIONS';

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok
    ? {
        'access-control-allow-origin': origin || '*',
        'access-control-allow-methods': CORS_METHODS,
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : {};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // Edge health check: answers without starting the container.
    if (url.pathname === '/edge-health') {
      return Response.json({ status: 'ok', edge: true });
    }

    // One instance per colo keeps the ephemeris warm for nearby visitors.
    const region = request.cf?.colo ?? 'default';
    const container = getContainer(env.API_CONTAINER, String(region));

    try {
      const response = await container.fetch(request);
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders(request, env))) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error('proxy failed', error);
      return Response.json({ error: 'calculation service unavailable' }, { status: 503 });
    }
  },
};
