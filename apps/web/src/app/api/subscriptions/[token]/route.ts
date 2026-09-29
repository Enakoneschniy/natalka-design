import { type NextRequest, NextResponse } from 'next/server';
import { subscriptionChange, subscriptionView } from '@/lib/jobs';

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const view = await subscriptionView(token);
  if (!view) return NextResponse.json({ error: 'gone' }, { status: 404 });
  return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = (await request.json()) as { cadence?: string; status?: string };
  const ok = await subscriptionChange(token, 'PATCH', body);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const ok = await subscriptionChange(token, 'DELETE');
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
