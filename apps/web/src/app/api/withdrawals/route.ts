import { type NextRequest, NextResponse } from 'next/server';
import { declareWithdrawal } from '@/lib/jobs';
import { invalid, notSameOrigin, readJson, relayFailure, unavailable } from '@/lib/route';
import { checkWithdrawal } from '@/lib/validate';

const MAX_WITHDRAWAL_BYTES = 4 * 1024;

/** The withdrawal page's confirm button (§ 356a BGB). The declaration goes to the jobs worker,
 * which mails the visitor a receipt with its content and the moment it arrived; the page shows
 * that moment too. */
export async function POST(request: NextRequest) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const read = await readJson(request, MAX_WITHDRAWAL_BYTES);
  if (!read.ok) return read.response;
  const checked = checkWithdrawal(read.value);
  if (!checked.ok) return invalid(checked.field);

  let result: Awaited<ReturnType<typeof declareWithdrawal>>;
  try {
    result = await declareWithdrawal(checked.value);
  } catch (error) {
    return unavailable('withdrawal failed', error);
  }
  if (!result.ok) return relayFailure('withdrawal refused', result);
  const receivedAt = typeof result.data.received_at === 'string' ? result.data.received_at : null;
  return NextResponse.json(
    { status: 'received', received_at: receivedAt },
    { status: 202, headers: { 'cache-control': 'no-store' } },
  );
}
