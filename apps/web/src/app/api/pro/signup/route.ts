import { NextResponse } from 'next/server';
import { requestSignup } from '@/lib/pro/client';
import { clientIp, jsonBody, notOnProHost, notSameOrigin, relay } from '@/lib/pro/guard';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The sign-up form: forwards the fields to the jobs worker, which validates them. */
export async function POST(request: Request) {
  const blocked = notOnProHost(request);
  if (blocked) return blocked;
  const refused = notSameOrigin(request);
  if (refused) return refused;
  const body = await jsonBody(request);
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const invite = text(body.invite).trim();
  return relay(() =>
    requestSignup(
      {
        email: text(body.email).trim(),
        name: text(body.name).trim(),
        ...(invite ? { invite } : {}),
        terms: body.terms === true,
      },
      clientIp(request),
    ),
  );
}
