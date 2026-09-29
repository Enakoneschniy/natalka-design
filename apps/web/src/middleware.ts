import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { countryLocale, isRussianAllowed, routing } from '@/i18n/routing';
import {
  EXPERIMENT_COOKIE,
  EXPERIMENT_MAX_AGE,
  mintVariant,
  randomVariant,
  readVariant,
} from '@/lib/experiment';

const intl = createMiddleware(routing);

/** Cloudflare sets `cf-ipcountry`; locally it is absent and detection falls back to Accept-Language. */
export async function middleware(request: NextRequest) {
  const country = request.headers.get('cf-ipcountry');

  // Russia is not a market: payments are impossible there, so the service is not offered.
  if (country === 'RU') {
    return NextResponse.rewrite(new URL('/unavailable', request.url));
  }

  // In Ukraine the Russian locale is not offered at all.
  if (!isRussianAllowed(country) && request.nextUrl.pathname.startsWith('/ru')) {
    return NextResponse.redirect(
      new URL(request.nextUrl.pathname.replace(/^\/ru/, '/uk'), request.url),
    );
  }

  const geoLocale = country ? countryLocale[country] : undefined;
  if (geoLocale && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL(`/${geoLocale}`, request.url));
  }

  const response = intl(request);

  // The price experiment: assigned once, here, before a page can read it, and left alone after.
  const carried = request.cookies.get(EXPERIMENT_COOKIE)?.value;
  if (!(await readVariant(carried))) {
    response.cookies.set(EXPERIMENT_COOKIE, await mintVariant(randomVariant()), {
      maxAge: EXPERIMENT_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  }
  // Closed to search engines for now. The header repeats what the page metadata says, for the
  // crawlers that read one and not the other.
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|unavailable|.*\\..*).*)'],
};
