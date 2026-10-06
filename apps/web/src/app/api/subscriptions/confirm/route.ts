import { type NextRequest, NextResponse } from 'next/server';
import { confirmSubscription } from '@/lib/jobs';
import { invalid, notSameOrigin, readJson, relayFailure, unavailable } from '@/lib/route';

/** A link token is a few hundred characters. */
const MAX_CONFIRM_BYTES = 4 * 1024;

/** «Подтвердить подписку» on the confirmation page. Only this POST confirms — opening the link
 * does not, so a mail scanner that follows it starts nothing. The answer is the subscription's
 * management token, for the page to go to. */
export async function POST(request: NextRequest) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const read = await readJson(request, MAX_CONFIRM_BYTES);
  if (!read.ok) return read.response;
  const { token } = read.value;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return invalid('token');
  }

  let result: Awaited<ReturnType<typeof confirmSubscription>>;
  try {
    result = await confirmSubscription(token);
  } catch (error) {
    return unavailable('subscription confirm failed', error);
  }
  const noStore = { 'cache-control': 'no-store' };
  if (result.ok) {
    const manage = result.data.token;
    if (typeof manage !== 'string' || manage.length === 0) {
      return unavailable('subscription confirm failed', new Error('no management token'));
    }
    return NextResponse.json({ token: manage }, { headers: noStore });
  }
  if (result.status === 404) {
    return NextResponse.json({ error: 'gone' }, { status: 404, headers: noStore });
  }
  return relayFailure('subscription confirm refused', result);
}
