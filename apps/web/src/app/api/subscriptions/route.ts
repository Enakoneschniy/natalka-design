import { type NextRequest, NextResponse } from 'next/server';
import { createSubscription } from '@/lib/jobs';
import { invalid, notSameOrigin, readJson, relayFailure, unavailable } from '@/lib/route';
import { checkSubscription } from '@/lib/validate';

const MAX_SUBSCRIPTION_BYTES = 16 * 1024;

/** Asks for a horoscope subscription. Nothing starts here: the jobs worker keeps it pending and
 * mails a confirmation link to the address, so the answer is always the same 202 "pending" and
 * never a link to manage it. */
export async function POST(request: NextRequest) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const read = await readJson(request, MAX_SUBSCRIPTION_BYTES);
  if (!read.ok) return read.response;
  const checked = checkSubscription(read.value);
  if (!checked.ok) return invalid(checked.field);

  let result: Awaited<ReturnType<typeof createSubscription>>;
  try {
    result = await createSubscription(checked.value);
  } catch (error) {
    return unavailable('subscription failed', error);
  }
  if (!result.ok) return relayFailure('subscription refused', result);
  return NextResponse.json(
    { status: 'pending' },
    { status: 202, headers: { 'cache-control': 'no-store' } },
  );
}
