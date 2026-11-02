import { type NextRequest, NextResponse } from 'next/server';
import { lookupPromo, PROMO_COOKIE, promoMaxAge } from '@/lib/promo';
import { notFromThisOrigin, notSameOrigin, readJson } from '@/lib/route';

/** A code typed on the order screen: checked against the table and, if it applies, kept in the
 * same cookie a code in a link goes to. The price itself is never sent from here — the pages and
 * the order work it out from the cookie, on the server. */
export async function POST(request: NextRequest) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const read = await readJson(request, 1024);
  if (!read.ok) return read.response;
  const found = lookupPromo(read.value.code);
  if (!found.ok) {
    return NextResponse.json(
      { ok: false, reason: found.reason },
      { status: 422, headers: { 'cache-control': 'no-store' } },
    );
  }
  const response = NextResponse.json(
    { ok: true, code: found.promo.code, percent: found.promo.percent },
    { headers: { 'cache-control': 'no-store' } },
  );
  response.cookies.set(PROMO_COOKIE, found.promo.code, {
    maxAge: promoMaxAge(found.promo),
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
  return response;
}

/** "Убрать": the visitor no longer wants the code they entered. */
export async function DELETE(request: NextRequest) {
  const refused = notFromThisOrigin(request);
  if (refused) return refused;
  const response = new NextResponse(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
  response.cookies.set(PROMO_COOKIE, '', { maxAge: 0, path: '/' });
  return response;
}
