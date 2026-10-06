/** Answers and checks shared by the shop's route handlers. */

const NO_STORE = { 'cache-control': 'no-store' };

/** 503 for the browser. Why it happened goes to the log, never into the response: an upstream
 * message names internal hosts and can quote the request back. */
export function unavailable(context: string, error?: unknown): Response {
  if (error !== undefined) {
    console.error(context, error instanceof Error ? error.message : String(error));
  }
  return Response.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
}
