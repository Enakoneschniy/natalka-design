import { NextResponse } from 'next/server';
import { requestLogin } from '@/lib/pro/client';
import {
  clientIp,
  jsonBody,
  notOnProHost,
  notSameOrigin,
  overJsonCap,
  relay,
} from '@/lib/pro/guard';
import { requestLang as letterLang } from '@/lib/pro/lang';

/** The sign-in form: asks the jobs worker for a letter, in the language the cabinet speaks to this
 * visitor. The answer never says whether it went. */
export async function POST(request: Request) {
  const blocked = notOnProHost(request);
  if (blocked) return blocked;
  const refused = notSameOrigin(request) ?? overJsonCap(request);
  if (refused) return refused;
  const body = await jsonBody(request);
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  return relay(() => requestLogin(email, letterLang(request), clientIp(request)));
}
