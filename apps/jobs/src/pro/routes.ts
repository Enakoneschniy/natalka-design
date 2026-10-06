/** /v1/pro/* — the seller cabinet's API.
 *
 * Called only by the pro site's server, which proves itself with PRO_API_KEY (x-pro-key); the
 * browser never has the key. Past that, every route but the two sign-in steps needs a session.
 */

import type { Env } from '../env';
import { errorCode } from '../errors';
import { contentDisposition } from '../filename';
import { sendLoginLink, sendSignupLink } from '../mail';
import {
  accountExists,
  authenticate,
  consumeLoginToken,
  createLoginToken,
  createSignupToken,
  endSessions,
  issueSession,
  normalizeEmail,
  type ProAccount,
} from './auth';
import {
  brandImage,
  deleteBrandImage,
  getBrand,
  type ImageKind,
  parseBrand,
  putBrandImage,
  MAX_IMAGE,
  saveBrandAndTone,
  saveBrand,
} from './brand';
import { createClient, getClient, listClients, parseClientBirth } from './clients';
import { balance } from './credits';
import { PACKS, attachSession, createPurchase, isPack, listPurchases, markFailed } from './purchases';
import { createPackCheckout } from '../stripe';
import { openPayload } from '../pipeline';
import { hasRedeemed, redeemInvite } from './invites';
import { assemblePdf, readingPdf, regenerateSection } from './lifecycle';
import { fileReport } from './reports';
import { requesterOf } from './requester';
import { createReading, deleteClient, demoReadingRow, listReadings, readingRow, readingView } from './readings';

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

/** Runs the work behind a sign-in or sign-up request after the answer has gone: looking the
 * address up, storing a token and sending the letter. The answer is the same 202 at the same
 * moment whether the address has an account, gets a letter or is over its limit. Without a
 * context (direct callers, tests) the work is awaited, so it is deterministic. A failure is logged
 * by its code and never shown: it would tell whether a letter was attempted. */
async function afterAnswer(ctx: ExecutionContext | undefined, work: Promise<void>): Promise<void> {
  const logged = work.catch((error) => console.error('pro sign-in letter failed', errorCode(error)));
  if (ctx) ctx.waitUntil(logged);
  else await logged;
}

const loginLink = (env: Env, token: string): string => `${env.PRO_SITE_URL}/login/${token}`;

/** The letter an address gets: a sign-in link when it has an account; when it has none, a link
 * that creates one for a sign-up, and nothing for a sign-in. */
async function sendSignInLetter(
  env: Env,
  email: string,
  requester: string,
  signup: { name: string; invite: string | null } | null,
): Promise<void> {
  if (await accountExists(env.DB, email)) {
    const token = await createLoginToken(env.DB, email, requester);
    if (token) await sendLoginLink(env, email, loginLink(env, token));
  } else if (signup) {
    const token = await createSignupToken(env.DB, email, requester, signup);
    if (token) await sendSignupLink(env, email, loginLink(env, token));
  }
}

/** Always 202 for a well-formed address: the answer must not tell whether an account exists.
 * A link goes out only when there is an account to sign in to. */
async function requestLogin(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const email = normalizeEmail((await readBody(request))?.email);
  if (!email) return json({ error: 'email' }, 400);
  await afterAnswer(ctx, sendSignInLetter(env, email, await requesterOf(request, env), null));
  return json({ ok: true }, 202);
}

const MAX_INVITE = 64;

/** Registers a seller: a confirm letter for a new address, a sign-in letter for a registered one.
 * Either way the answer is the same 202. */
async function requestSignup(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  if (!email) return json({ error: 'email' }, 400);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 60) return json({ error: 'name' }, 400);
  if (body?.terms !== true) return json({ error: 'terms' }, 400);
  const code = typeof body.invite === 'string' ? body.invite.trim() : '';
  const invite = code && code.length <= MAX_INVITE ? code : null;
  await afterAnswer(ctx, sendSignInLetter(env, email, await requesterOf(request, env), { name, invite }));
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
    name: account.name,
    tone: account.tone,
    balance: await balance(env.DB, account.id),
    invite_redeemed: await hasRedeemed(env.DB, account.id),
  });
}

async function invite(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const result = await redeemInvite(env.DB, account.id, (await readBody(request))?.code);
  if (result.status === 'already') return json({ error: 'already redeemed' }, 409);
  if (result.status === 'invalid') return json({ error: 'invalid code' }, 404);
  if (result.status === 'too_many') return json({ error: 'too_many' }, 429);
  return json({ credits: result.credits, balance: await balance(env.DB, account.id) });
}

async function addClient(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const body = await readBody(request);
  if (body?.consent !== true) return json({ error: 'consent' }, 400);
  const birth = parseClientBirth(body);
  if (!birth) return json({ error: 'birth' }, 400);
  return json({ id: await createClient(env, account.id, birth) }, 201);
}

async function orderReading(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const body = (await readBody(request)) ?? {};
  const result = await createReading(env, account, body);
  if (result.status === 'created') return json({ id: result.id }, 201);
  if (result.status === 'insufficient') return json({ error: 'insufficient credits', balance: result.balance }, 402);
  return json({ error: result.error }, 400);
}

/** The sample reading: texts only, nothing about whose chart it is. */
async function demo(env: Env): Promise<Response> {
  const row = env.PRO_DEMO_ORDER_ID ? await demoReadingRow(env.DB, env.PRO_DEMO_ORDER_ID) : null;
  if (!row || row.step !== 'done') return json({ error: 'not found' }, 404);
  const view = await readingView(env, row);
  return json({ product: view.product, sections: view.sections });
}

const BRAND_IMAGE = /^\/v1\/pro\/brand\/(logo|photo)$/;

async function putBrand(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const body = await readBody(request);
  const brand = parseBrand(body);
  if (!brand) return json({ error: 'brand' }, 400);
  const tone = body?.tone;
  if (tone !== undefined && tone !== 'vy' && tone !== 'ty') return json({ error: 'tone' }, 400);
  if (tone === undefined) await saveBrand(env, account.id, brand);
  else await saveBrandAndTone(env, account.id, brand, tone);
  return json({ ok: true });
}

async function brandRoutes(request: Request, env: Env, url: URL, account: ProAccount): Promise<Response | null> {
  const { method } = request;
  const path = url.pathname;

  if (path === '/v1/pro/brand') {
    if (method === 'GET') {
      return json({ brand: await getBrand(env, account.id), tone: account.tone });
    }
    if (method === 'PUT') return putBrand(request, env, account);
  }
  const image = path.match(BRAND_IMAGE);
  if (image?.[1]) {
    const kind = image[1] as ImageKind;
    if (method === 'PUT') {
      if (Number(request.headers.get('content-length')) > MAX_IMAGE) return json({ error: 'image' }, 400);
      const result = await putBrandImage(env, account.id, kind, await request.arrayBuffer());
      if (result === 'ok') return json({ ok: true });
      return result === 'no_brand' ? json({ error: 'no_brand' }, 409) : json({ error: 'image' }, 400);
    }
    if (method === 'GET') {
      const found = await brandImage(env, account.id, kind);
      if (!found) return json({ error: 'not found' }, 404);
      return new Response(found.body, {
        headers: { 'content-type': found.contentType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
      });
    }
    if (method === 'DELETE') {
      await deleteBrandImage(env, account.id, kind);
      return json({ ok: true });
    }
  }
  return null;
}

async function createPackPurchase(request: Request, env: Env, account: ProAccount): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'payments unavailable' }, 503);
  const pack = (await readBody(request))?.pack;
  if (!isPack(pack)) return json({ error: 'pack' }, 400);
  const purchase = await createPurchase(env.DB, account.id, pack);
  let session;
  try {
    session = await createPackCheckout(env, {
      purchaseId: purchase.id,
      accountId: account.id,
      email: account.email,
      pack,
      credits: PACKS[pack].credits,
      amountMinor: purchase.amount_minor,
      currency: purchase.currency,
    });
  } catch (error) {
    console.error('pack checkout failed', purchase.id, errorCode(error));
    await markFailed(env.DB, purchase.id, account.id);
    return json({ error: 'checkout' }, 502);
  }
  // A session exists now and the seller may pay. Whatever happens here the purchase stays
  // pending: the webhook settles it by metadata.purchase_id, and a 'failed' row would refuse it.
  try {
    await attachSession(env.DB, purchase.id, session.id);
  } catch (error) {
    console.error('pack attachSession failed', purchase.id, errorCode(error));
  }
  return json({ id: purchase.id, checkout_url: session.url }, 201);
}

async function purchaseRoutes(request: Request, env: Env, url: URL, account: ProAccount): Promise<Response | null> {
  if (url.pathname !== '/v1/pro/purchases') return null;
  if (request.method === 'POST') return createPackPurchase(request, env, account);
  if (request.method === 'GET') return json({ purchases: await listPurchases(env.DB, account.id) });
  return null;
}

const CLIENT = /^\/v1\/pro\/clients\/([^/]+)$/;
const READING = /^\/v1\/pro\/readings\/([^/]+)$/;
const REGENERATE = /^\/v1\/pro\/readings\/([^/]+)\/sections\/([^/]+)\/regenerate$/;
const REPORT = /^\/v1\/pro\/readings\/([^/]+)\/sections\/([^/]+)\/report$/;
const PDF = /^\/v1\/pro\/readings\/([^/]+)\/pdf$/;

async function reportSection(
  request: Request,
  env: Env,
  account: ProAccount,
  orderId: string,
  sectionId: string,
): Promise<Response> {
  const row = await readingRow(env.DB, orderId, account.id);
  const plan = row ? ((await openPayload(env, row)).plan ?? []) : [];
  if (!row || !plan.some((p) => p.id === sectionId)) return json({ error: 'not found' }, 404);
  const result = await fileReport(env, account.id, orderId, sectionId, (await readBody(request))?.comment);
  if (result === 'comment') return json({ error: 'comment' }, 400);
  if (result === 'too_many') return json({ error: 'too many' }, 429);
  return json({ ok: true }, 201);
}

async function readingRoutes(request: Request, env: Env, url: URL, account: ProAccount): Promise<Response | null> {
  const { method } = request;
  const path = url.pathname;

  if (path === '/v1/pro/clients') {
    if (method === 'POST') return addClient(request, env, account);
    if (method === 'GET') return json({ clients: await listClients(env, account.id) });
  }
  const client = path.match(CLIENT);
  if (client?.[1]) {
    if (method === 'GET') {
      const found = await getClient(env, account.id, client[1]);
      if (!found) return json({ error: 'not found' }, 404);
      return json({ client: found, readings: await listReadings(env, account.id, found.id) });
    }
    if (method === 'DELETE') {
      return (await deleteClient(env, account.id, client[1])) ? json({ ok: true }) : json({ error: 'not found' }, 404);
    }
  }
  if (path === '/v1/pro/readings') {
    if (method === 'POST') return orderReading(request, env, account);
    if (method === 'GET') return json({ readings: await listReadings(env, account.id) });
  }
  const reading = path.match(READING);
  if (reading?.[1] && method === 'GET') {
    const row = await readingRow(env.DB, reading[1], account.id);
    return row ? json(await readingView(env, row)) : json({ error: 'not found' }, 404);
  }
  const rewrite = path.match(REGENERATE);
  if (rewrite?.[1] && rewrite[2] && method === 'POST') {
    const result = await regenerateSection(env, account.id, rewrite[1], rewrite[2]);
    if (result.status === 'ok') return json({ section: result.section, regenerations_left: result.regenerations_left });
    if (result.status === 'not_found') return json({ error: 'not found' }, 404);
    if (result.status === 'failed') return json({ error: 'failed' }, 503);
    return json({ error: result.status }, 409);
  }
  const flag = path.match(REPORT);
  if (flag?.[1] && flag[2] && method === 'POST') return reportSection(request, env, account, flag[1], flag[2]);
  const pdf = path.match(PDF);
  if (pdf?.[1]) {
    if (method === 'POST') {
      const result = await assemblePdf(env, account.id, pdf[1]);
      if (result === 'queued') return json({ ok: true }, 202);
      if (result === 'not_found') return json({ error: 'not found' }, 404);
      return json({ error: result }, 409);
    }
    if (method === 'GET') {
      const found = await readingPdf(env, account.id, pdf[1]);
      if (!found) return json({ error: 'not found' }, 404);
      return new Response(found.body, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': contentDisposition(found.filename),
          'cache-control': 'private, no-store',
        },
      });
    }
  }
  if (path === '/v1/pro/demo' && method === 'GET') return demo(env);
  return null;
}

/** Constant-time check of the shared key; fails closed when the secret is not configured. */
function hasProKey(request: Request, env: Env): boolean {
  const expected = env.PRO_API_KEY;
  const given = request.headers.get('x-pro-key');
  if (!expected || !given) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

export async function handlePro(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  if (!url.pathname.startsWith('/v1/pro/')) return null;
  if (!hasProKey(request, env)) return json({ error: 'unauthorized' }, 401);
  const route = `${request.method} ${url.pathname}`;

  // Only POST spends a sign-in token: mail scanners open links with GET.
  if (route === 'POST /v1/pro/login') return requestLogin(request, env, ctx);
  if (route === 'POST /v1/pro/signup') return requestSignup(request, env, ctx);
  if (route === 'POST /v1/pro/session') return startSession(request, env);

  const account = await authenticate(request, env);
  if (!account) return json({ error: 'unauthorized' }, 401);

  if (route === 'GET /v1/pro/me') return me(env, account);
  if (route === 'POST /v1/pro/invite') return invite(request, env, account);
  if (route === 'POST /v1/pro/logout') {
    await endSessions(env.DB, account.id);
    return json({ ok: true });
  }
  const branded = await brandRoutes(request, env, url, account);
  if (branded) return branded;
  const bought = await purchaseRoutes(request, env, url, account);
  if (bought) return bought;
  const handled = await readingRoutes(request, env, url, account);
  if (handled) return handled;
  return json({ error: 'not found' }, 404);
}
