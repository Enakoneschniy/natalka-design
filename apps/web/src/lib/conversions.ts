import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cookies, headers } from 'next/headers';
import { jobsFetch } from '@/lib/jobs';
import { CONSENT_COOKIE, readConsent } from '@/lib/marketing';
import { LOOKS_AUTOMATED } from '@/lib/stats';

/** The visitor's browser, for the conversions the jobs worker reports to Meta.
 *
 * Meta's pixel is never on the preview, the order or the subscription: those pages carry birth
 * data. What happens there is reported from the server instead (apps/jobs/src/meta.ts), and Meta
 * matches it to an ad click by the browser it happened in. This is that browser: its address, its
 * user agent and the two cookies the pixel set on the landing. Null — and nothing is sent — unless
 * the visitor said yes to the cookie question; null for a crawler too.
 */
export interface Browser {
  ip: string | null;
  ua: string;
  /** Meta's browser id and click id, as the pixel wrote them; the jobs worker checks the format. */
  fbp: string | null;
  fbc: string | null;
}

interface CookieJar {
  get(name: string): { value: string } | undefined;
}

export function browserFrom(list: Pick<Headers, 'get'>, jar: CookieJar): Browser | null {
  if (readConsent(jar.get(CONSENT_COOKIE)?.value) !== 'granted') return null;
  const ua = list.get('user-agent') ?? '';
  if (!ua || LOOKS_AUTOMATED.test(ua)) return null;
  return {
    ip: list.get('cf-connecting-ip'),
    ua: ua.slice(0, 512),
    fbp: jar.get('_fbp')?.value ?? null,
    fbc: jar.get('_fbc')?.value ?? null,
  };
}

/** A visitor is looking at the preview of their own chart. Like the counters, it never holds up
 * the page: the call runs after the response, and a failure is a lost report. */
export async function reportView(view: {
  product: string;
  locale: string;
  amount_minor: number;
  currency: string;
}): Promise<void> {
  try {
    const list = await headers();
    const browser = browserFrom(list, await cookies());
    if (!browser) return;
    const { ctx } = getCloudflareContext();
    const call = jobsFetch('/v1/conversions/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...view, country: list.get('cf-ipcountry'), browser }),
    }).then(
      (response) => {
        if (!response.ok) console.error('view report', response.status);
      },
      (error: unknown) =>
        console.error('view report', error instanceof Error ? error.name : 'failed'),
    );
    ctx.waitUntil(call);
  } catch {
    // A report is never a reason for a page to fail.
  }
}
