/**
 * Edge wrapper for the Python text-and-document API.
 *
 * The API renders PDFs and calls the model, so it lives in a Cloudflare Container. This Worker is
 * its only entry point: it lets through the jobs Worker, which sends the shared key, proxies the
 * request to the container, keeps one warm instance and answers health checks without waking it.
 * No browser ever calls it, so it sends no CORS headers.
 */
import { Container, getContainer } from '@cloudflare/containers';
import { containerEnv, KEY_HEADER, type ModelSecrets, refusal } from './edge';

interface Env extends ModelSecrets {
  API_CONTAINER: DurableObjectNamespace<ApiContainer>;
  /** Set as a Worker secret, the same value as the jobs Worker's NATALKA_API_KEY. Without it
   * the edge serves the health checks and nothing else. */
  ACCESS_KEY?: string;
}

export class ApiContainer extends Container {
  defaultPort = 8000;
  /** Idle instances keep billing until they sleep, and a reading is a burst of calls rather than
   * steady traffic, so five minutes is the better trade against a ~3 s cold start. */
  sleepAfter = '5m';

  override envVars: Record<string, string> = containerEnv(this.env as Env);

  override onStart() {
    console.log('container started');
  }

  override onError(error: unknown) {
    console.error('container error', error);
    return new Response('calculation service unavailable', { status: 503 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Edge health check: answers without starting the container.
    if (request.method === 'GET' && url.pathname === '/edge-health') {
      return Response.json({ status: 'ok', edge: true });
    }

    const refused = await refusal(request, env.ACCESS_KEY);
    if (refused) return refused;

    // The key stops here: the container has no use for it.
    const forwarded = new Request(request);
    forwarded.headers.delete(KEY_HEADER);

    // One shared instance rather than one per colo: warm instances bill while they idle, and a
    // handful of milliseconds of extra latency is invisible next to a calculation.
    const container = getContainer(env.API_CONTAINER, 'main');

    try {
      return await container.fetch(forwarded);
    } catch (error) {
      console.error('proxy failed', error);
      return Response.json({ error: 'calculation service unavailable' }, { status: 503 });
    }
  },
};
