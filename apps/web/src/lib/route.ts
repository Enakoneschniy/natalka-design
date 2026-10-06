/** Answers and checks shared by the shop's route handlers. */

const NO_STORE = { 'cache-control': 'no-store' };

const answer = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: NO_STORE });

/** 503 for the browser. Why it happened goes to the log, never into the response: an upstream
 * message names internal hosts and can quote the request back. */
export function unavailable(context: string, error?: unknown): Response {
  if (error !== undefined) {
    console.error(context, error instanceof Error ? error.message : String(error));
  }
  return answer(503, { error: 'unavailable' });
}

/** 400, naming the field that is wrong, as the jobs worker does. */
export const invalid = (field: string): Response => answer(400, { error: 'invalid', field });

export const tooMany = (): Response => answer(429, { error: 'too_many' });

/** What the browser hears when the jobs worker said no: its 400 with the field it named, its 413
 * and 429 as they are, and anything else as an outage — the status goes to the log. */
export function relayFailure(context: string, failure: { status: number; field?: string }) {
  if (failure.status === 400) return invalid(failure.field ?? 'body');
  if (failure.status === 413) return answer(413, { error: 'too large' });
  if (failure.status === 429) return tooMany();
  console.error(context, failure.status);
  return answer(failure.status === 503 ? 503 : 502, { error: 'unavailable' });
}

/** Refuses what a page on another site could send: a body that is not JSON (a cross-site
 * `<form enctype="text/plain">` needs no preflight), or a request the browser does not mark as
 * same-origin. */
export function notSameOrigin(request: Request): Response | null {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    return answer(415, { error: 'content-type' });
  }
  return notFromThisOrigin(request);
}

/** The origin half of `notSameOrigin`, for a request without a body. Without `Sec-Fetch-Site`
 * (older browsers) the `Origin` must name this host. */
export function notFromThisOrigin(request: Request): Response | null {
  const forbidden = () => answer(403, { error: 'origin' });
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin' ? null : forbidden();
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return forbidden();
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase() ? null : forbidden();
  } catch {
    return forbidden();
  }
}

export type JsonRead =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response };

/** The request's JSON object, read only when it is no larger than `max` bytes: by the length it
 * states first, then by what actually arrived. */
export async function readJson(request: Request, max: number): Promise<JsonRead> {
  const tooLarge = { ok: false as const, response: answer(413, { error: 'too large' }) };
  const stated = Number(request.headers.get('content-length') ?? '0');
  if (stated > max) return tooLarge;
  const text = await request.text().catch(() => null);
  if (text === null) return { ok: false, response: answer(400, { error: 'bad request' }) };
  if (new TextEncoder().encode(text).byteLength > max) return tooLarge;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, response: answer(400, { error: 'bad request' }) };
  }
  return { ok: true, value: value as Record<string, unknown> };
}
