import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import {
  EXPERIMENT_COOKIE,
  EXPERIMENT_MAX_AGE,
  mintVariant,
  randomVariant,
  readVariant,
} from '@/lib/experiment';
import { INDEXABLE, isPrivatePath } from '@/lib/seo';

const intl = createMiddleware(routing);

/** Cloudflare sets `cf-ipcountry`; locally it is absent. */
export async function middleware(request: NextRequest) {
  const country = request.headers.get('cf-ipcountry');

  // Russia is not a market: payments are impossible there, so the service is not offered.
  if (country === 'RU') {
    return NextResponse.rewrite(new URL('/unavailable', request.url));
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
  const carried = request.cookies.get(EXPERIMENT_COOKIE)?.value;
  if (!(await readVariant(carried))) {
    const minted = await mintVariant(randomVariant());
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
