import { type NextRequest, NextResponse } from 'next/server';
import { defaultLocale } from '@/i18n/routing';
import { cancelSubscription } from '@/lib/jobs';
import { unavailable } from '@/lib/route';

type Params = { params: Promise<{ token: string }> };

/** One-click unsubscribe (RFC 8058), the link in a horoscope letter's `List-Unsubscribe`: the mail
 * client POSTs `List-Unsubscribe=One-Click` here from its own servers, so there is no Origin to
 * check — the signed management token in the path is the whole permission, and all it allows is
 * cancelling. The body is not read. */
export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  let cancelled: boolean;
  try {
    cancelled = await cancelSubscription(token);
  } catch (error) {
    return unavailable('one-click unsubscribe failed', error);
  }
  return NextResponse.json(cancelled ? { ok: true } : { error: 'gone' }, {
    status: cancelled ? 200 : 404,
    headers: { 'cache-control': 'no-store' },
  });
}

/** The same link opened in a browser (or by a mail scanner) cancels nothing: it opens the
 * subscription's page, where cancelling is a button. */
export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const page = new URL(`/${defaultLocale}/subscription`, request.url);
  page.searchParams.set('t', token);
  return NextResponse.redirect(page, 303);
}
