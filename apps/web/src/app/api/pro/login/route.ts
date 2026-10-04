import { NextResponse } from 'next/server';
import { requestLogin } from '@/lib/pro/client';
import { jsonBody, notOnProHost, notSameOrigin, relay } from '@/lib/pro/guard';

/** The sign-in form: asks the jobs worker for a letter. The answer never says whether it went. */
export async function POST(request: Request) {
  const blocked = notOnProHost(request);
  if (blocked) return blocked;
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const body = await jsonBody(request);
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  return relay(() => requestLogin(email));
}
