import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import {
  EXPERIMENT_COOKIE,
  EXPERIMENT_MAX_AGE,
  mintVariant,
  readVariant,
  variantFor,
} from '@/lib/experiment';
import { cleanSource, readSource, SOURCE_COOKIE } from '@/lib/marketing';
import { isProHost } from '@/lib/pro/host';
import { isClosedCountry } from '@/lib/region';
import { INDEXABLE, isPrivatePath } from '@/lib/seo';

const intl = createMiddleware(routing);

/** Cloudflare sets `cf-ipcountry`; locally it is absent. */
export async function middleware(request: NextRequest) {
  const country = request.headers.get('cf-ipcountry');

  // Russia is not a market: payments are impossible there, so the service is not offered.
  if (isClosedCountry(country)) {
    return NextResponse.rewrite(new URL('/unavailable', request.url));
  }

  // The seller cabinet answers on its own host, from its own tree under `app/pro`. None of the
  // shop's machinery runs there: no locale routing, no price experiment, no ad source.
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

  // The site used to be in three languages. Anyone holding one of those links — a bookmark, a
  // message, the odd crawler — lands on the same page in Russian rather than on a 404.
  const gone = request.nextUrl.pathname.match(/^\/(uk|en)(\/.*)?$/);
  if (gone) {
    const url = new URL(`/ru${gone[2] ?? ''}${request.nextUrl.search}`, request.url);
    return NextResponse.redirect(url, 308);
  }

  const response = intl(request);

  // The price experiment: assigned once, here, before a page can read it, and left alone after.
  // A visitor without the cookie gets the side their address falls on, so clearing cookies shows
  // the same price again.
  const carried = request.cookies.get(EXPERIMENT_COOKIE)?.value;
  if (!(await readVariant(carried))) {
    const minted = await mintVariant(await variantFor(request.headers.get('cf-connecting-ip')));
    if (minted) {
      response.cookies.set(EXPERIMENT_COOKIE, minted, {
        maxAge: EXPERIMENT_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
      });
    }
  }
  // Where this visit came from, taken from the advert's own link and kept until the browser is
  // closed. First touch wins: the landing is where the campaign is named, and the pages after it
  // carry no utm of their own.
  const source = cleanSource(request.nextUrl.searchParams.get('utm_source'));
  if (source && !readSource(request.cookies.get(SOURCE_COOKIE)?.value)) {
    response.cookies.set(SOURCE_COOKIE, source, { sameSite: 'lax', secure: true, path: '/' });
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
