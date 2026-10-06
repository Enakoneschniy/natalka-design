import { NextResponse } from 'next/server';
import { jobStatus } from '@/lib/jobs';
import { unavailable } from '@/lib/route';

/** Progress for the waiting page. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let status: Awaited<ReturnType<typeof jobStatus>>;
  try {
    status = await jobStatus(token);
  } catch (error) {
    return unavailable('job status failed', error);
  }
  if (!status) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } });
}
