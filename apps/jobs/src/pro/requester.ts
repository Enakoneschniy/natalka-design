/** Who asked for a sign-in or sign-up link, for the limits on the letters an address is sent.
 *
 * The pro site's server passes the visitor's address as Cloudflare saw it (x-client-ip); only it
 * can send the header, from behind the key. The address is reduced to the block one requester
 * holds — an IPv4 address as it is, an IPv6 address to its /64, which a single subscriber gets
 * whole and can pick new addresses from at will — and kept only as an HMAC under SESSION_KEY: the
 * table holds no address and nothing an address can be checked against without the key. A missing
 * or malformed header is the one requester 'unknown'.
 */

import { hmacHex } from '../crypto';
import type { Env } from '../env';

/** The requester of every request without a usable address. Never an HMAC: those are hex. */
export const UNKNOWN_REQUESTER = 'unknown';

/** The longest an address is written (an IPv6 address ending in an IPv4 one). */
const MAX_ADDRESS = 45;

function ipv4Octets(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

/** The eight 16-bit groups of an IPv6 address, or null when the text is not one. A dotted IPv4
 * address may stand for the last two groups. */
function ipv6Groups(text: string): number[] | null {
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string, last: boolean): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const out: number[] = [];
    for (const [index, group] of groups.entries()) {
      if (last && index === groups.length - 1 && group.includes('.')) {
        const octets = ipv4Octets(group);
        if (!octets) return null;
        out.push(((octets[0] as number) << 8) | (octets[1] as number), ((octets[2] as number) << 8) | (octets[3] as number));
      } else if (/^[0-9a-f]{1,4}$/i.test(group)) {
        out.push(Number.parseInt(group, 16));
      } else {
        return null;
      }
    }
    return out;
  };
  const head = parse(halves[0] ?? '', halves.length === 1);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = parse(halves[1] ?? '', true);
  if (!tail) return null;
  // "::" stands for one group of zeros or more.
  const zeros = 8 - head.length - tail.length;
  return zeros >= 1 ? [...head, ...new Array<number>(zeros).fill(0), ...tail] : null;
}

/** The block an address belongs to, written one way only: an IPv4 address in plain decimal, an
 * IPv6 address as its /64 (`2001:db8:0:1::/64`), an IPv4-mapped IPv6 address as the IPv4 one.
 * Null when there is no address or it is not one. */
export function addressBlock(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';
  if (!text || text.length > MAX_ADDRESS) return null;
  const v4 = ipv4Octets(text);
  if (v4) return v4.join('.');
  if (!text.includes(':')) return null;
  const groups = ipv6Groups(text);
  if (!groups) return null;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

/** The requester of a request: the first 32 hex characters of HMAC-SHA256(SESSION_KEY, block), or
 * 'unknown'. */
export async function requesterOf(request: Request, env: Env): Promise<string> {
  const block = addressBlock(request.headers.get('x-client-ip'));
  return block === null ? UNKNOWN_REQUESTER : (await hmacHex(env.SESSION_KEY, block)).slice(0, 32);
}
