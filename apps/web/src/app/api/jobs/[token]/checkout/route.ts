import { type NextRequest, NextResponse } from 'next/server';
import { isStripeCheckout, resumeCheckout } from '@/lib/jobs';
import { notSameOrigin, relayFailure, unavailable } from '@/lib/route';

type Params = { params: Promise<{ token: string }> };

/** «Перейти к оплате» on the waiting page: a new payment page for an order that is still unpaid.
 * The jobs worker closes the old one and opens another for the same amount; the browser gets the
 * address only when it is Stripe's. A paid or closed order is 409, which the page answers by
 * reading its status again. */
export async function POST(request: NextRequest, { params }: Params) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const { token } = await params;

  let result: Awaited<ReturnType<typeof resumeCheckout>>;
  try {
    result = await resumeCheckout(token);
  } catch (error) {
    return unavailable('resume failed', error);
  }
  const noStore = { 'cache-control': 'no-store' };
  if (result.ok) {
    const url = result.data.checkout_url;
    if (!isStripeCheckout(url)) {
      return unavailable('resume failed', new Error('checkout is not on Stripe'));
    }
    return NextResponse.json({ checkout_url: url }, { headers: noStore });
  }
  if (result.status === 404) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: noStore });
  }
  if (result.status === 409) {
    const error = result.error === 'paid' ? 'paid' : 'closed';
    return NextResponse.json({ error }, { status: 409, headers: noStore });
  }
  return relayFailure('resume refused', result);
}
