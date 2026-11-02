import { type NextRequest, NextResponse } from 'next/server';
import { browserFrom } from '@/lib/conversions';
import { createOrder, isStripeCheckout } from '@/lib/jobs';
import { CONSENT_COOKIE, readConsent, readSource, SOURCE_COOKIE } from '@/lib/marketing';
import { bundlePrice, priceFor } from '@/lib/pricing';
import { activePromo, PROMO_COOKIE } from '@/lib/promo';
import { invalid, notSameOrigin, readJson, relayFailure, unavailable } from '@/lib/route';
import { checkOrder } from '@/lib/validate';

/** Where the payment provider forbids what we sell (psychic services and fortune tellers are on
 * Stripe's list for these three), the order is not started at all. */
const NOT_SOLD_TO = new Set(['JP', 'MX', 'TH']);

/** The jobs worker's own limit for an order. */
const MAX_ORDER_BYTES = 16 * 1024;

/** Starts a generation. The price is taken from our own table, never from the request body, and
 * the body is checked against the jobs worker's limits before it is passed on. */
export async function POST(request: NextRequest) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const read = await readJson(request, MAX_ORDER_BYTES);
  if (!read.ok) return read.response;
  const checked = checkOrder(read.value);
  if (!checked.ok) return invalid(checked.field);
  const { product } = checked.value;

  const country = request.headers.get('cf-ipcountry');
  if (country && NOT_SOLD_TO.has(country.toUpperCase())) {
    return NextResponse.json({ error: 'region' }, { status: 403 });
  }
  // Kept with the order because the payment webhook arrives later, without a browser: this is
  // the only moment at which either of these is knowable.
  const consent = readConsent(request.cookies.get(CONSENT_COOKIE)?.value);
  const source = readSource(request.cookies.get(SOURCE_COOKIE)?.value);
  // The checkout and the payment are reported to Meta from the jobs worker, from this browser.
  const browser = browserFrom(request.headers, request.cookies);
  // The figure the paywall showed, offer or code and all, from the same table: a price that
  // arrived in the request body would be a price the buyer chose. The code is read from its
  // cookie and looked up again here, so an expired one is not honoured however it is carried.
  const promo = activePromo(request.cookies.get(PROMO_COOKIE)?.value);
  const bundle = product === 'bundle' ? bundlePrice(country, new Date(), promo) : null;
  const price = bundle ?? priceFor(product, country);

  let result: Awaited<ReturnType<typeof createOrder>>;
  try {
    result = await createOrder({
      ...checked.value,
      country: country ?? undefined,
      amount_minor: price.amount,
      currency: price.currency,
      // The order's price variant: the code it was priced with, so a sale can be traced to the
      // video or the letter that gave the code out.
      variant: bundle?.discount?.code ?? null,
      consent,
      source,
      ...(browser ? { browser } : {}),
    });
  } catch (error) {
    return unavailable('order failed', error);
  }
  if (!result.ok) return relayFailure('order refused', result);
  const { order_id, job_id, token, checkout_url } = result.data;
  if (typeof token !== 'string' || token.length === 0) {
    return unavailable('order failed', new Error('no order token'));
  }
  // Payment happens on Stripe's page and nowhere else.
  if (checkout_url !== undefined && !isStripeCheckout(checkout_url)) {
    return unavailable('order failed', new Error('checkout is not on Stripe'));
  }
  const created = { order_id, job_id, token };
  return NextResponse.json(checkout_url ? { ...created, checkout_url } : created, {
    status: 201,
    headers: { 'cache-control': 'no-store' },
  });
}
