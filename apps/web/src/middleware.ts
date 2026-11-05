import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { localeFor, routing } from '@/i18n/routing';
import { cleanSource, readSource, SOURCE_COOKIE } from '@/lib/marketing';
import { isProHost } from '@/lib/pro/host';
import { activePromo, PROMO_COOKIE, promoMaxAge } from '@/lib/promo';
import { isClosedCountry } from '@/lib/region';
import { INDEXABLE, isPrivatePath } from '@/lib/seo';

const intl = createMiddleware(routing);

/** The cookie the price test kept its side in, until 2026-11-02. */
const ENDED_TEST_COOKIE = 'cx';

/** Cloudflare sets `cf-ipcountry`; locally it is absent. */
export async function middleware(request: NextRequest) {
  const country = request.headers.get('cf-ipcountry');

  // Russia is not a market: payments are impossible there, so the service is not offered.
  if (isClosedCountry(country)) {
    return NextResponse.rewrite(new URL('/unavailable', request.url));
  }

  // The seller cabinet answers on its own host, from its own tree under `app/pro`. None of the
  // shop's machinery runs there: no locale routing, no ad source.
  const { pathname, search } = request.nextUrl;
  if (isProHost(request.headers.get('host'))) {
    const inner = pathname === '/' ? '/pro' : `/pro${pathname}`;
    const response = NextResponse.rewrite(new URL(`${inner}${search}`, request.url));
    response.headers.set('x-robots-tag', 'noindex, nofollow');
    return response;
  }
  // …and that tree does not exist anywhere else.
  if (pathname === '/pro' || pathname.startsWith('/pro/')) {
    return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
  }

  // English was a language of the site once. Anyone holding such a link — a bookmark, a message,
  // the odd crawler — lands on the same page in Russian rather than on a 404.
  const gone = request.nextUrl.pathname.match(/^\/en(\/.*)?$/);
  if (gone) {
    const url = new URL(`/ru${gone[1] ?? ''}${request.nextUrl.search}`, request.url);
    return NextResponse.redirect(url, 308);
  }

  // The bare address: German for a browser that asks for German first, Russian otherwise. The
  // query goes along — a promo code or an advert's tags arrive on links to the front page too.
  if (pathname === '/') {
    const locale = localeFor(request.headers.get('accept-language'));
    return NextResponse.redirect(new URL(`/${locale}${search}`, request.url), 307);
  }

  const response = intl(request);

  // The price test is over, and the privacy policy no longer names its cookie: whoever still
  // carries one has it taken back rather than kept for the rest of its sixty days.
  if (request.cookies.has(ENDED_TEST_COOKIE)) {
    response.cookies.set(ENDED_TEST_COOKIE, '', { maxAge: 0, path: '/' });
  }
  // Where this visit came from, taken from the advert's own link and kept until the browser is
  // closed. First touch wins: the landing is where the campaign is named, and the pages after it
  // carry no utm of their own.
  const source = cleanSource(request.nextUrl.searchParams.get('utm_source'));
  if (source && !readSource(request.cookies.get(SOURCE_COOKIE)?.value)) {
    response.cookies.set(SOURCE_COOKIE, source, { sameSite: 'lax', secure: true, path: '/' });
  }

  // A promo code in the link — a video's description, a letter — is kept for the rest of the
  // visit and the days after it, until the code itself ends. Only a code that applies now is
  // kept; a later one in a link replaces it.
  const linked = activePromo(request.nextUrl.searchParams.get('code'));
  if (linked) {
    response.cookies.set(PROMO_COOKIE, linked.code, {
      maxAge: promoMaxAge(linked),
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  }

  // The header repeats what the page metadata says, for the crawlers that read one and not the
  // other — and it is the only thing that covers the PDFs and the API routes, which have no
  // metadata of their own.
  if (!INDEXABLE || isPrivatePath(request.nextUrl.pathname)) {
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|unavailable|.*\\..*).*)'],
};
