/** How the cabinet speaks about the seller's own account: whose cabinet a sign-in link opens.
 * Pure; pages and client components share it. */

/** An address masked as the jobs worker masks it on the sign-in confirm page: the first two
 * characters of the local part (one, when it is shorter), `***@` and the whole domain. */
export function maskEmail(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address.slice(0, Math.min(2, at))}***@${address.slice(at + 1)}`;
}

/** The signed-in cabinet, masked, when a sign-in link opens a different one; null when the link
 * opens the same cabinet, as far as the masks tell. The page never learns the link's full
 * address, so masks are what it compares. */
export function otherCabinet(link: string, signedIn: string): string | null {
  const current = maskEmail(signedIn);
  return current === link.trim().toLowerCase() ? null : current;
}
