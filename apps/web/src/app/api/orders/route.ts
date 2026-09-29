import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { createOrder, type OrderRequest } from '@/lib/jobs';
import { PRODUCTS, type ProductKey, priceFor } from '@/lib/pricing';

/** Starts a generation. The price is taken from our own table, never from the request body. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<OrderRequest> & { product?: string };
  const product = (PRODUCTS as readonly string[]).includes(body.product ?? '')
    ? (body.product as ProductKey)
    : 'natal';

  if (!body.email || !body.birth?.date || !body.birth?.zone) {
    return NextResponse.json({ error: 'email and birth data are required' }, { status: 400 });
  }

  const country = (await headers()).get('cf-ipcountry');
  const price = priceFor(product, country);

  try {
    const created = await createOrder({
      email: body.email,
      product,
      locale: body.locale ?? 'uk',
      country: country ?? undefined,
      amount_minor: price.amount,
      currency: price.currency,
      // Nothing is charged yet: every order made from the site is a test order until Stripe is in.
      test: true,
      birth: body.birth as OrderRequest['birth'],
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('order failed', reason);
    return NextResponse.json(
      { error: 'could not start the reading', reason: reason.slice(0, 300) },
      { status: 502 },
    );
  }
}
