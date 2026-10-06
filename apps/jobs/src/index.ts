/**
 * The order pipeline: takes birth data, returns a PDF.
 *
 * The web app never talks to the calculation API or the model directly — it creates an order here
 * and polls. Everything that costs money or touches personal data happens in this Worker, which is
 * the only place with the database, the bucket and the keys.
 */

import { canonicalJson, encryptJson, LINK_TTL_SECONDS, readLink, sameSecret, sha256Hex, signLink } from './crypto';
import {
  cachePreview,
  claimTelegramLink,
  deliverable,
  forgetTelegramChat,
  markTelegramDelivered,
  orderState,
  orderStatusOf,
  telegramCodeFor,
  telegramLink,
  cachedPreview,
  documentForOrder,
  expiryFrom,
  getJob,
  insertChart,
  insertJob,
  insertOrder,
  now,
  orderContact,
  setOrderSession,
  bumpStat,
} from './db';
import type { Env, QueueMessage } from './env';
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  type Cadence,
  claimTelegramSubscription,
  confirmSubscription,
  deleteSubscription,
  deliverHoroscope,
  dueSubscriptions,
  endTrial,
  forgetTelegramSubscriptions,
  latestHoroscope,
  requestSubscription,
  subscriptionBirth,
  subscriptionChart,
  subscriptionFromToken,
  subscriptionStatus,
  telegramCodeForSubscription,
  updateSubscription,
} from './subscriptions';
import { contentDisposition, documentFilename } from './filename';
import { type CheckoutSession, createCheckoutSession, expireCheckoutSession } from './stripe';
import { json, readJson } from './http';
import {
  InvalidField,
  type OrderInput,
  parseOrder,
  parsePreview,
  parseSubscription,
  type PreviewInput,
  type SubscriptionInput,
} from './validate';
import { consumeJob, DEAD_LETTER_QUEUE, deadLetter } from './consumer';
import { errorCode } from './errors';
import { apiFetch, loadBirth, openPayload } from './pipeline';
import { sweep } from './retention';
import { handlePro } from './pro/routes';
import { stripeWebhook } from './webhook';

/** A chart's facts run to a few kilobytes; a synastry carries two. */
const PREVIEW_LIMIT = 64 * 1024;

/** The free passages shown before payment.
 *
 * Only the fields the text API's preview takes are read and forwarded; anything else in the body
 * stays here. The passages are cached by those fields, names included: a reload, a second tab or
 * a visitor who comes back tomorrow costs nothing, and the key is a hash that tells anyone reading
 * the table nothing about who asked. */
async function previewText(request: Request, env: Env): Promise<Response> {
  const read = await readJson(request, PREVIEW_LIMIT);
  if (!read.ok) return read.response;
  let input: PreviewInput;
  try {
    input = parsePreview(read.body);
  } catch (error) {
    if (error instanceof InvalidField) return json({ error: 'invalid', field: error.field }, 400);
    throw error;
  }
  const key = await sha256Hex(new TextEncoder().encode(canonicalJson(input)).buffer as ArrayBuffer);

  const hit = await cachedPreview(env.DB, key);
  if (hit) return json({ blocks: JSON.parse(hit.blocks) });

  let upstream: Response;
  try {
    upstream = await apiFetch(env, '/v1/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // A field that was not sent stays out, and the API takes its default.
      body: JSON.stringify(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null))),
    });
  } catch (error) {
    console.error('preview failed', errorCode(error));
    return json({ error: 'preview unavailable' }, 503);
  }
  if (!upstream.ok) {
    console.error('preview failed', upstream.status);
    return json({ error: 'preview unavailable' }, 503);
  }
  const result = (await upstream.json()) as {
    blocks?: { title: string; text: string }[];
    cost_micros?: number;
    model?: string;
  };
  if (!Array.isArray(result.blocks)) return json({ error: 'preview unavailable' }, 503);
  await cachePreview(
    env.DB,
    {
      key,
      lang: input.lang ?? '',
      blocks: JSON.stringify(result.blocks),
      cost_micros: result.cost_micros ?? 0,
      model: result.model ?? '',
    },
    Number(env.RETENTION_DAYS ?? '30'),
  );
  return json({ blocks: result.blocks });
}

/** An order is a few hundred bytes; this leaves room for long place names and nothing else. */
const ORDER_LIMIT = 16 * 1024;

/** The order's own page: where the buyer waits for the document, and where Stripe sends them back
 * whether they paid or not. */
const orderPage = (env: Env, locale: string, token: string): string =>
  `${env.SITE_URL}/${locale}/generating?t=${token}`;

async function createOrder(request: Request, env: Env): Promise<Response> {
  const read = await readJson(request, ORDER_LIMIT);
  if (!read.ok) return read.response;
  let order: OrderInput;
  try {
    order = parseOrder(read.body);
  } catch (error) {
    if (error instanceof InvalidField) return json({ error: 'invalid', field: error.field }, 400);
    throw error;
  }

  // Whether an order is free is decided by the worker, never by the request alone: with Stripe
  // configured only the test key makes one free, and without Stripe nothing is accepted unless
  // free orders are switched on, which only a developer's machine does.
  const test =
    (await sameSecret(request.headers.get('x-test-order'), env.TEST_ORDER_KEY)) ||
    (!env.STRIPE_SECRET_KEY && env.ALLOW_FREE_ORDERS === '1');
  if (!test && !env.STRIPE_SECRET_KEY) return json({ error: 'payments unavailable' }, 503);

  const orderId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const retention = Number(env.RETENTION_DAYS ?? '30');

  await insertOrder(env.DB, {
    id: orderId,
    email: order.email,
    product: order.product,
    locale: order.locale,
    country: order.country,
    amount_minor: order.amount_minor,
    currency: order.currency,
    status: test ? 'test' : 'pending',
    variant: order.variant,
    consent: order.consent,
    source: order.source,
    created_at: now(),
  });

  // One encrypted row per person; the second exists only for a synastry.
  const people = order.birth_second ? [order.birth, order.birth_second] : [order.birth];
  for (const [index, person] of people.entries()) {
    const { ciphertext, nonce } = await encryptJson({ ...person, lang: order.locale }, env.DATA_KEY);
    await insertChart(env.DB, {
      id: crypto.randomUUID(),
      order_id: orderId,
      person_no: index === 0 ? 1 : 2,
      ciphertext,
      nonce,
      unknown_time: person.time === null,
      gender: person.gender,
      expires_at: expiryFrom(retention),
    });
  }

  await insertJob(env.DB, { id: jobId, order_id: orderId, kind: order.product });
  // Counted here rather than in the browser: an order is a thing that happened, not a click.
  await bumpStat(env.DB, {
    event: 'order',
    variant: order.variant,
    source: order.source,
    country: order.country,
    currency: order.currency,
  });
  // The token is the only thing the browser needs afterwards: it names the order and expires.
  const token = await signLink('order', { order: orderId, job: jobId }, env.LINK_KEY, LINK_TTL_SECONDS);

  // A test order skips the payment and goes straight to the queue.
  if (test) {
    await env.JOBS.send({ jobId });
    return json({ order_id: orderId, job_id: jobId, token }, 201);
  }

  let session: CheckoutSession;
  try {
    session = await createCheckoutSession(env, {
      orderId,
      jobId,
      email: order.email,
      locale: order.locale,
      currency: order.currency,
      amountMinor: order.amount_minor,
      product: order.product,
      returnUrl: orderPage(env, order.locale, token),
      idempotencyKey: `checkout-${orderId}`,
    });
  } catch (error) {
    // The order stays pending: the buyer can open the payment page again from the order's page.
    console.error('checkout failed', orderId, errorCode(error));
    return json({ error: 'checkout' }, 502);
  }
  await setOrderSession(env.DB, orderId, session.id);
  // The job waits in the table, not in the queue, until the webhook says the money is in.
  return json({ order_id: orderId, job_id: jobId, token, checkout_url: session.url }, 201);
}

/** A new payment page for an order that was never paid. The previous page is closed first, so one
 * order cannot be paid twice from two pages; if it turns out to have been paid a moment ago, the
 * answer says so and nothing new is opened. */
async function resumeCheckout(env: Env, token: string): Promise<Response> {
  const claims = await readLink('order', token, env.LINK_KEY);
  if (!claims) return json({ error: 'not found' }, 404);
  const order = await orderState(env.DB, claims.order);
  const job = await getJob(env.DB, claims.job);
  if (!order || order.pro_account_id || job?.order_id !== order.id) return json({ error: 'not found' }, 404);
  const status = orderStatusOf(order);
  if (status === 'paid' || status === 'test') return json({ error: 'paid' }, 409);
  if (status !== 'pending') return json({ error: 'closed' }, 409);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'payments unavailable' }, 503);

  const previous = order.stripe_session_id;
  if (previous && (await expireCheckoutSession(env, previous)) === 'complete') {
    return json({ error: 'paid' }, 409);
  }
  let session: CheckoutSession;
  try {
    session = await createCheckoutSession(env, {
      orderId: order.id,
      jobId: claims.job,
      email: order.email,
      locale: order.locale,
      currency: order.currency,
      amountMinor: order.amount_minor,
      product: order.product,
      returnUrl: orderPage(env, order.locale, token),
      // Two taps while one page is current open one new page between them, not two.
      idempotencyKey: `resume-${order.id}-${previous ?? 'none'}`,
    });
  } catch (error) {
    console.error('checkout failed', order.id, errorCode(error));
    return json({ error: 'checkout' }, 502);
  }
  await env.DB.prepare(
    `UPDATE orders SET stripe_session_id = ?, checkout_at = ?
     WHERE id = ? AND status = 'pending' AND hold IS NULL`,
  )
    .bind(session.id, now(), order.id)
    .run();
  return json({ checkout_url: session.url });
}

async function jobStatus(env: Env, token: string): Promise<Response> {
  const claims = await readLink('order', token, env.LINK_KEY);
  if (!claims) return json({ error: 'link expired' }, 404);

  const job = await getJob(env.DB, claims.job);
  if (!job || job.order_id !== claims.order) return json({ error: 'not found' }, 404);
  const order = await orderState(env.DB, job.order_id);
  if (!order || order.pro_account_id) return json({ error: 'not found' }, 404);

  const payload = await openPayload(env, job);
  const total = payload.plan?.length ?? 0;
  const written = payload.sections?.length ?? 0;
  const status = orderStatusOf(order);
  const document =
    job.step === 'done' && deliverable(status) ? await documentForOrder(env.DB, job.order_id) : null;
  // The sale, for the conversion the browser reports once the buyer is back from the payment
  // page. A run that was never charged says so, so that a free document is not counted as one.
  const sale = order.status === 'paid';

  return json({
    step: job.step,
    status: job.status,
    // 'pending' means the payment page was opened and nothing has settled yet.
    paid: order.status === 'paid' || order.status === 'test',
    test: order.status === 'test',
    order_status: status,
    order_id: job.order_id,
    amount_minor: sale ? order.amount_minor : null,
    currency: sale ? order.currency : null,
    written,
    total,
    // Calculation is quick and rendering is a few seconds; the text is the whole wait.
    progress: total ? Math.round((written / total) * 100) : 0,
    // A code, never the reason: the site shows its own words for it.
    error: job.status === 'failed' ? 'failed' : null,
    pages: document?.pages ?? null,
    download: document ? `/d/${token}` : null,
  });
}

/** The finished PDF and the name it should carry, for a valid token. */
async function finishedDocument(
  env: Env,
  token: string,
): Promise<{ body: ReadableStream; filename: string } | Response> {
  const claims = await readLink('order', token, env.LINK_KEY);
  if (!claims) return new Response('link expired', { status: 404 });
  const order = await orderState(env.DB, claims.order);
  const job = await getJob(env.DB, claims.job);
  if (!order || order.pro_account_id || !job || job.order_id !== claims.order) {
    return new Response('not found', { status: 404 });
  }
  // A refunded or disputed payment takes the document with it.
  const status = orderStatusOf(order);
  if (status === 'refunded' || status === 'disputed') return new Response('gone', { status: 410 });

  const document = await documentForOrder(env.DB, claims.order);
  if (!document) return new Response('not ready', { status: 404 });

  const object = await env.DOCS.get(document.storage_key);
  if (!object) return new Response('gone', { status: 410 });

  const product = job.kind;
  const first = await loadBirth(env, claims.order);
  const second = product === 'synastry' ? await loadBirth(env, claims.order, 2) : null;
  return {
    body: object.body,
    filename: documentFilename(product, first.lang, first, second),
  };
}

async function download(env: Env, token: string): Promise<Response> {
  const found = await finishedDocument(env, token);
  if (found instanceof Response) return found;
  return new Response(found.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': contentDisposition(found.filename),
      'cache-control': 'private, no-store',
    },
  });
}

/** The code the site puts in its "get it in Telegram" link. */
async function telegramCode(env: Env, token: string): Promise<Response> {
  const claims = await readLink('order', token, env.LINK_KEY);
  if (!claims) return json({ error: 'link expired' }, 404);
  const contact = await orderContact(env.DB, claims.order);
  if (!contact) return json({ error: 'not found' }, 404);
  const code = await telegramCodeFor(env.DB, {
    order_id: claims.order,
    job_id: claims.job,
    locale: contact.locale,
  });
  return json({ code });
}

// ---- subscriptions ------------------------------------------------------------------------

const CADENCES = new Set<string>(['week', 'month']);
/** A subscription request is a birth and an address; a management change is two words. */
const SUBSCRIPTION_LIMIT = 16 * 1024;
const SMALL_LIMIT = 4 * 1024;

/** Always the same 202, whatever became of the request: the answer must not tell whether the
 * address has subscriptions, and it never carries a management link — that comes only by
 * confirming from the letter. */
async function subscribe(request: Request, env: Env): Promise<Response> {
  const read = await readJson(request, SUBSCRIPTION_LIMIT);
  if (!read.ok) return read.response;
  let input: SubscriptionInput;
  try {
    input = parseSubscription(read.body);
  } catch (error) {
    if (error instanceof InvalidField) return json({ error: 'invalid', field: error.field }, 400);
    throw error;
  }
  await requestSubscription(env, input);
  return json({ status: 'pending' }, 202);
}

/** Confirms from the letter's link, by POST only: mail scanners open links with GET. */
async function subscriptionConfirm(request: Request, env: Env): Promise<Response> {
  const read = await readJson(request, SMALL_LIMIT);
  if (!read.ok) return read.response;
  const token = read.body.token;
  if (typeof token !== 'string') return json({ error: 'not found' }, 404);
  let manage: string | null;
  try {
    manage = await confirmSubscription(env, token);
  } catch (error) {
    // The chart could not be computed; the link still works, so the subscriber can try again.
    console.error('confirming a subscription', errorCode(error));
    return json({ error: 'unavailable' }, 503);
  }
  return manage ? json({ token: manage }) : json({ error: 'not found' }, 404);
}

async function subscriptionView(env: Env, token: string): Promise<Response> {
  const sub = await subscriptionFromToken(env, token);
  if (!sub) return json({ error: 'link expired' }, 404);
  const latest = await latestHoroscope(env.DB, sub.id);
  const birth = await subscriptionBirth(env, sub);
  const chart = await subscriptionChart(env, sub);
  return json({
    status: subscriptionStatus(sub),
    cadence: sub.cadence,
    email: sub.email,
    locale: sub.locale,
    name: chart?.name || birth?.name || null,
    next_send_at: sub.next_send_at,
    trial_ends_at: sub.trial_ends_at,
    // The birth data is shown only while it is still on file; after that the chart alone remains.
    birth: birth ? { date: birth.date, time: birth.time, place: birth.place } : null,
    correction_until: sub.birth_expires_at,
    telegram_code: await telegramCodeForSubscription(env.DB, sub.id),
    latest: latest
      ? {
          title: latest.title,
          text: latest.text,
          period: latest.period,
          start: latest.start_date,
          end: latest.end_date,
        }
      : null,
  });
}

async function subscriptionUpdate(request: Request, env: Env, token: string): Promise<Response> {
  const sub = await subscriptionFromToken(env, token);
  if (!sub) return json({ error: 'link expired' }, 404);
  const read = await readJson(request, SMALL_LIMIT);
  if (!read.ok) return read.response;
  const body = read.body as { cadence?: unknown; status?: unknown };
  const patch: { cadence?: Cadence; status?: 'active' | 'paused' | 'cancelled' } = {};
  if (typeof body.cadence === 'string' && CADENCES.has(body.cadence)) patch.cadence = body.cadence as Cadence;
  if (body.status === 'active' || body.status === 'paused' || body.status === 'cancelled') {
    patch.status = body.status;
  }
  // A subscription not yet confirmed, or whose free month is over, cannot be started from here.
  const current = subscriptionStatus(sub);
  if (patch.status === 'active' && (current === 'pending' || current === 'ended')) {
    return json({ error: 'closed' }, 409);
  }
  await updateSubscription(env.DB, sub.id, patch);
  return json({ ok: true });
}

async function subscriptionDelete(env: Env, token: string): Promise<Response> {
  const sub = await subscriptionFromToken(env, token);
  if (!sub) return json({ error: 'link expired' }, 404);
  await deleteSubscription(env.DB, sub.id);
  return json({ ok: true });
}

/** What the bot may ask, over its service binding and nothing else: an RPC entrypoint has no
 * URL, so these never face the internet the way the worker's fetch handler does. */
export class JobsInternal extends WorkerEntrypoint<Env> {
  /** On /start <code>: remembers the chat and says whether the document is ready. */
  async claimTelegram(code: string, chatId: number) {
    const link = await telegramLink(this.env.DB, code);
    if (!link) {
      // Not a document link: perhaps a subscription's. The latest horoscope, if one has been
      // written already, goes to the chat at once rather than waiting for the next window.
      const sub = await claimTelegramSubscription(this.env.DB, code, chatId);
      if (!sub) return null;
      const latest = await latestHoroscope(this.env.DB, sub.id);
      return {
        kind: 'subscription' as const,
        locale: sub.locale,
        ready: false,
        failed: false,
        token: null,
        horoscope: latest ? { title: latest.title, text: latest.text } : null,
      };
    }
    // A code already bound to another chat is not this chat's to use.
    if (!(await claimTelegramLink(this.env.DB, link.code, chatId))) return null;
    const job = await getJob(this.env.DB, link.job_id);
    const ready = job?.step === 'done';
    const token = ready
      ? await signLink('order', { order: link.order_id, job: link.job_id }, this.env.LINK_KEY, LINK_TTL_SECONDS)
      : null;
    return {
      kind: 'document' as const,
      locale: link.locale,
      ready,
      failed: job?.status === 'failed',
      token,
      horoscope: null,
    };
  }

  async telegramDelivered(code: string) {
    await markTelegramDelivered(this.env.DB, code);
  }

  async forgetTelegram(chatId: number) {
    await forgetTelegramChat(this.env.DB, chatId);
    await forgetTelegramSubscriptions(this.env.DB, chatId);
  }

  /** The finished PDF for a signed token, with the name it should carry, or null. */
  async document(token: string): Promise<{ bytes: ArrayBuffer; filename: string } | null> {
    const found = await finishedDocument(this.env, token);
    if (found instanceof Response) return null;
    return { bytes: await new Response(found.body).arrayBuffer(), filename: found.filename };
  }
}

/** The site's server proves itself with SITE_KEY (x-site-key) on every call; the browser never has
 * the key. Without the secret configured nothing is served: a missing key must not open the door. */
async function siteGate(request: Request, env: Env): Promise<Response | null> {
  // A header value arrives trimmed; a secret typed or piped in may end in a newline, and one of
  // nothing but whitespace is no secret.
  const expected = env.SITE_KEY?.trim();
  if (!expected) {
    console.error('SITE_KEY is not configured; refusing site routes');
    return json({ error: 'unavailable' }, 503);
  }
  if (!(await sameSecret(request.headers.get('x-site-key'), expected))) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Open to anyone: the health check, and Stripe, which signs what it sends.
    if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok' });
    if (url.pathname === '/v1/stripe/webhook' && request.method === 'POST') {
      return stripeWebhook(request, env);
    }
    // The seller cabinet has a key of its own (x-pro-key), checked there.
    if (url.pathname.startsWith('/v1/pro/')) {
      return (await handlePro(request, env, url, ctx)) ?? new Response('not found', { status: 404 });
    }
    const refused = await siteGate(request, env);
    if (refused) return refused;

    // An order's routes; the token names the order.
    const job = url.pathname.match(/^\/v1\/jobs\/([^/]+)(?:\/(telegram|checkout))?$/);
    if (job?.[1]) {
      const [, token, action] = job;
      // The code behind the site's "get it in Telegram" link.
      if (action === 'telegram' && request.method === 'POST') return telegramCode(env, token);
      if (action === 'checkout' && request.method === 'POST') return resumeCheckout(env, token);
      if (!action && request.method === 'GET') return jobStatus(env, token);
    }
    const file = url.pathname.match(/^\/d\/([^/]+)$/);
    if (file?.[1] && request.method === 'GET') return download(env, file[1]);

    if (url.pathname === '/v1/subscriptions' && request.method === 'POST') {
      return subscribe(request, env);
    }
    if (url.pathname === '/v1/subscriptions/confirm' && request.method === 'POST') {
      return subscriptionConfirm(request, env);
    }
    const subscription = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (subscription?.[1]) {
      if (request.method === 'GET') return subscriptionView(env, subscription[1]);
      if (request.method === 'PATCH') return subscriptionUpdate(request, env, subscription[1]);
      if (request.method === 'DELETE') return subscriptionDelete(env, subscription[1]);
    }
    if (url.pathname === '/v1/orders' && request.method === 'POST') {
      return createOrder(request, env);
    }
    if (url.pathname === '/v1/preview' && request.method === 'POST') {
      return previewText(request, env);
    }

    return new Response('not found', { status: 404 });
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (batch.queue === DEAD_LETTER_QUEUE) {
        await deadLetter(env, message);
        continue;
      }
      if ('subscriptionId' in message.body) {
        try {
          await deliverHoroscope(env, message.body.subscriptionId);
          message.ack();
        } catch (error) {
          console.error('horoscope failed', message.body.subscriptionId, errorCode(error));
          message.retry();
        }
        continue;
      }
      await consumeJob(env, message);
    }
  },

  /** Hourly: horoscopes that are due go to the queue. Nightly: the retention sweep (retention.ts). */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === '5 * * * *') {
      const due = await dueSubscriptions(env.DB);
      let ended = 0;
      for (const sub of due) {
        // A free month that is over ends the subscription instead of writing one more.
        if (sub.trial_ends_at && sub.trial_ends_at <= now()) {
          if (await endTrial(env, sub.id)) ended++;
        } else {
          await env.JOBS.send({ subscriptionId: sub.id });
        }
      }
      console.log(`horoscopes: ${due.length - ended} due, ${ended} free months ended`);
      return;
    }
    await sweep(env);
  },
};
