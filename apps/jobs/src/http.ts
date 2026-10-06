/** What every route answers with, and how it reads what it is sent. */

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export type JsonBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

/** A JSON object of at most `limit` bytes, or the answer that refuses it: 413 when it is larger —
 * by its Content-Length, or by what actually arrives, since the header may be missing or wrong —
 * and 400 when it is not a JSON object. */
export async function readJson(request: Request, limit: number): Promise<JsonBody> {
  const tooLarge = (): JsonBody => ({ ok: false, response: json({ error: 'too large' }, 413) });
  const invalid = (): JsonBody => ({ ok: false, response: json({ error: 'invalid', field: 'body' }, 400) });
  if (Number(request.headers.get('content-length')) > limit) return tooLarge();

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalid();
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid();
  return { ok: true, body: body as Record<string, unknown> };
}
