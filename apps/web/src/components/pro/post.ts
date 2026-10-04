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
