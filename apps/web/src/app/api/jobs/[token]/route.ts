import { NextResponse } from 'next/server';
import { jobStatus } from '@/lib/jobs';

/** Progress for the waiting page. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = await jobStatus(token);
  if (!status) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } });
}
