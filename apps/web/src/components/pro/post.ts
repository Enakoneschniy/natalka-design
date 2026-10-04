/** Posts JSON to one of the cabinet's own `/api/pro/*` routes; the status, or 0 when offline. */
export async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; error?: string }> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { status: response.status, error: data?.error };
  } catch {
    return { status: 0 };
  }
}

/** Calls the cabinet's proxy (`/api/pro/x/*`) with any method. Every call says it carries JSON,
 * a bodyless DELETE included: the proxy refuses a mutation that does not. The status is 0 when
 * offline; `data` is null when the answer was not JSON. */
export async function sendJson<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  try {
    const response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: (await response.json().catch(() => null)) as T | null };
  } catch {
    return { status: 0, data: null };
  }
}

/** Where a page goes when the proxy says the session is gone (401). */
export function signInAgain(): void {
  window.location.assign('/login?expired=1');
}

export { TRY_LATER } from '@/lib/pro/messages';

export const UNAVAILABLE = 'Сервис временно недоступен, попробуйте через минуту';

/** What the confirm page makes of `/api/pro/session`'s answer: a dead link (400) and a service
 * that is down (503) read differently; anything else, offline included, is a plain retry. */
export function confirmOutcome(status: number): 'signed-in' | 'expired' | 'unavailable' | 'failed' {
  if (status === 200) return 'signed-in';
  if (status === 400) return 'expired';
  if (status === 503) return 'unavailable';
  return 'failed';
}
