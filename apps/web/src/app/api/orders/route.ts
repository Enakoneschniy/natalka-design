import { type NextRequest, NextResponse } from 'next/server';
import { EXPERIMENT_COOKIE, readVariant } from '@/lib/experiment';
import { createOrder, JobsNotConfigured, type OrderRequest } from '@/lib/jobs';
import { CONSENT_COOKIE, readConsent, SOURCE_COOKIE } from '@/lib/marketing';
import { bundlePrice, PRODUCTS, type ProductKey, priceFor } from '@/lib/pricing';
import { unavailable } from '@/lib/route';

/** Where the payment provider forbids what we sell (psychic services and fortune tellers are on
 * Stripe's list for these three), the order is not started at all. */
const NOT_SOLD_TO = new Set(['JP', 'MX', 'TH']);

/** Starts a generation. The price is taken from our own table, never from the request body. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<OrderRequest> & { product?: string };
  const product = (PRODUCTS as readonly string[]).includes(body.product ?? '')
    ? (body.product as ProductKey)
    : 'natal';

  if (!body.email || !body.birth?.date || !body.birth?.zone) {
    return NextResponse.json({ error: 'email and birth data are required' }, { status: 400 });
  }
  if (product === 'synastry' && !(body.birth_second?.date && body.birth_second?.zone)) {
    return NextResponse.json({ error: 'a synastry needs two people' }, { status: 400 });
  }

  const country = request.headers.get('cf-ipcountry');
  if (country && NOT_SOLD_TO.has(country.toUpperCase())) {
    return NextResponse.json({ error: 'region' }, { status: 403 });
  }
  // The bundle runs the price experiment, and the figure the paywall showed is the figure that
  // must be charged. It is taken from the signed cookie here, on the server: a price that
  // arrived in the request body would be a price the buyer chose.
  const variant = await readVariant(request.cookies.get(EXPERIMENT_COOKIE)?.value);
  // Kept with the order because the payment webhook arrives later, without a browser: this is
  // the only moment at which either of these is knowable.
  const consent = readConsent(request.cookies.get(CONSENT_COOKIE)?.value);
  const source = request.cookies.get(SOURCE_COOKIE)?.value ?? null;
  const price = product === 'bundle' ? bundlePrice(country, variant) : priceFor(product, country);

  try {
    const created = await createOrder({
      email: body.email,
      product,
      locale: body.locale ?? 'ru',
      country: country ?? undefined,
      amount_minor: price.amount,
      currency: price.currency,
      variant,
      consent,
      source,
      birth: body.birth as OrderRequest['birth'],
      birth_second: product === 'synastry' ? body.birth_second : undefined,
      cancel_url: body.cancel_url,
      product_name: body.product_name,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof JobsNotConfigured) return unavailable('order failed', error);
    // The upstream message names internal hosts and can quote the request back; it belongs in the
    // log, not in a response a visitor can read.
    console.error('order failed', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'could not start the reading' }, { status: 502 });
  }
}
