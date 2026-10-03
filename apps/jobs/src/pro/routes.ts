/** /v1/pro/* — the seller cabinet's API.
 *
 * Called only by the pro site's server; the browser never sees this worker. Every route but the
 * two sign-in steps needs a session.
 */

import type { Env } from '../env';
import { sendLoginLink } from '../mail';
import {
  authenticate,
  consumeLoginToken,
  createLoginToken,
  endSessions,
  issueSession,
  normalizeEmail,
  type ProAccount,
} from './auth';
import { balance } from './credits';
import { hasRedeemed, redeemInvite } from './invites';

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const readBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Always 202 for a well-formed address: the answer must not tell whether an account exists. */
async function requestLogin(request: Request, env: Env): Promise<Response> {
  const email = normalizeEmail((await readBody(request))?.email);
  if (!email) return json({ error: 'email' }, 400);
  const token = await createLoginToken(env.DB, email);
  if (token) {
    try {
      await sendLoginLink(env, email, `${env.PRO_SITE_URL}/login/${token}`);
    } catch {
      return json({ error: 'mail unavailable' }, 503);
    }
  }
  return json({ ok: true }, 202);
}

async function startSession(request: Request, env: Env): Promise<Response> {
  const token = (await readBody(request))?.token;
  const account = typeof token === 'string' ? await consumeLoginToken(env.DB, token) : null;
  if (!account) return json({ error: 'link expired' }, 400);
  return json({
    session: await issueSession(env, account),
    account: { email: account.email, tone: account.tone },
  });
}

async function me(env: Env, account: ProAccount): Promise<Response> {
  return json({
    email: account.email,
    tone: account.tone,
    balance: await balance(env.DB, account.id),
    invite_redeemed: await hasRedeemed(env.DB, account.id),
  });
}

async function invite(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const result = await redeemInvite(env.DB, account.id, (await readBody(request))?.code);
  if (result.status === 'already') return json({ error: 'already redeemed' }, 409);
  if (result.status === 'invalid') return json({ error: 'invalid code' }, 404);
  return json({ credits: result.credits, balance: await balance(env.DB, account.id) });
}

export async function handlePro(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/v1/pro/')) return null;
  const route = `${request.method} ${url.pathname}`;

  // Only POST spends a sign-in token: mail scanners open links with GET.
  if (route === 'POST /v1/pro/login') return requestLogin(request, env);
  if (route === 'POST /v1/pro/session') return startSession(request, env);

  const account = await authenticate(request, env);
  if (!account) return json({ error: 'unauthorized' }, 401);

  if (route === 'GET /v1/pro/me') return me(env, account);
  if (route === 'POST /v1/pro/invite') return invite(request, env, account);
  if (route === 'POST /v1/pro/logout') {
    await endSessions(env.DB, account.id);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
