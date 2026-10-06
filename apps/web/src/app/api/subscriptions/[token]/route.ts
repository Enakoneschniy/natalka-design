import { type NextRequest, NextResponse } from 'next/server';
import { subscriptionChange, subscriptionView } from '@/lib/jobs';
import { unavailable } from '@/lib/route';

type Params = { params: Promise<{ token: string }> };

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

export async function PATCH(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = (await request.json()) as { cadence?: string; status?: string };
  try {
    const ok = await subscriptionChange(token, 'PATCH', body);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    return unavailable('subscription change failed', error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  try {
    const ok = await subscriptionChange(token, 'DELETE');
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    return unavailable('subscription delete failed', error);
  }
}
