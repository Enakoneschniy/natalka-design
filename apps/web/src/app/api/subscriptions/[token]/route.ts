import { type NextRequest, NextResponse } from 'next/server';
import { subscriptionChange, subscriptionView } from '@/lib/jobs';
import { notFromThisOrigin, notSameOrigin, readJson, unavailable } from '@/lib/route';

type Params = { params: Promise<{ token: string }> };

const CADENCES = new Set(['week', 'month']);
const STATUSES = new Set(['active', 'paused', 'cancelled']);

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  let view: Awaited<ReturnType<typeof subscriptionView>>;
  try {
    view = await subscriptionView(token);
  } catch (error) {
    return unavailable('subscription view failed', error);
  }
  if (!view) return NextResponse.json({ error: 'gone' }, { status: 404 });
  return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } });
}

/** A change made on the subscription page: the cadence, or pause, resume and cancel. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const read = await readJson(request, 1024);
  if (!read.ok) return read.response;
  const { cadence, status } = read.value;
  const body: { cadence?: string; status?: string } = {};
  if (typeof cadence === 'string' && CADENCES.has(cadence)) body.cadence = cadence;
  if (typeof status === 'string' && STATUSES.has(status)) body.status = status;
  if (!body.cadence && !body.status) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const { token } = await params;
  try {
    const ok = await subscriptionChange(token, 'PATCH', body);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    return unavailable('subscription change failed', error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const refused = notFromThisOrigin(request);
  if (refused) return refused;
  const { token } = await params;
  try {
    const ok = await subscriptionChange(token, 'DELETE');
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    return unavailable('subscription delete failed', error);
  }
}
