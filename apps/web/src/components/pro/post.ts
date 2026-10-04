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

export const TRY_LATER = 'Не получилось отправить. Попробуйте ещё раз через минуту.';

export const UNAVAILABLE = 'Сервис временно недоступен, попробуйте через минуту';

/** What the confirm page makes of `/api/pro/session`'s answer: a dead link (400) and a service
 * that is down (503) read differently; anything else, offline included, is a plain retry. */
export function confirmOutcome(status: number): 'signed-in' | 'expired' | 'unavailable' | 'failed' {
  if (status === 200) return 'signed-in';
  if (status === 400) return 'expired';
  if (status === 503) return 'unavailable';
  return 'failed';
}
