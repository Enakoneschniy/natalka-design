/** How the cabinet speaks about the seller's own account: whose cabinet a sign-in link opens, and
 * closing the cabinet. Pure; pages and client components share it. */

/** An address masked as the jobs worker masks it on the sign-in confirm page: the first two
 * characters of the local part, or one when the local part has two or fewer, then `***@` and the
 * whole domain. */
export function maskEmail(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  const keep = at <= 2 ? 1 : 2;
  return `${address.slice(0, keep)}***@${address.slice(at + 1)}`;
}

/** The signed-in cabinet, masked, when a sign-in link opens a different one; null when the link
 * opens the same cabinet, as far as the masks tell. The page never learns the link's full
 * address, so masks are what it compares. */
export function otherCabinet(link: string, signedIn: string): string | null {
  const current = maskEmail(signedIn);
  return current === link.trim().toLowerCase() ? null : current;
}

/** True when the typed address is the cabinet's, compared as the jobs worker compares them:
 * trimmed and lower-case. */
export function sameAddress(typed: string, email: string): boolean {
  const given = typed.trim().toLowerCase();
  return given !== '' && given === email.trim().toLowerCase();
}

export type CloseOutcome = 'closed' | 'mismatch' | 'signed-out' | 'failed';

/** What `DELETE /api/pro/x/me` came to: closed (204, the proxy has cleared the cookies), an
 * address the jobs worker would not take (400), a session already gone (401), or anything else,
 * offline included: a plain retry. */
export function closeOutcome(status: number): CloseOutcome {
  if (status === 204) return 'closed';
  if (status === 400) return 'mismatch';
  if (status === 401) return 'signed-out';
  return 'failed';
}
