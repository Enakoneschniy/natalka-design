/**
 * The order pipeline: takes birth data, returns a PDF.
 *
 * The web app never talks to the calculation API or the model directly — it creates an order here
 * and polls. Everything that costs money or touches personal data happens in this Worker, which is
 * the only place with the database, the bucket and the keys.
 */

import { encryptJson, LINK_TTL_SECONDS, readLink, sameSecret, sha256Hex, signLink } from './crypto';
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
  expired,
  expiryFrom,
  getJob,
  insertChart,
  insertJob,
  insertOrder,
  now,
  orderContact,
  setOrderSession,
  bumpStat,
  scrubExpiredJobPayloads,
  updateJob,
} from './db';
import type { Env, QueueMessage } from './env';
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  type Cadence,
  claimTelegramSubscription,
  createSubscription,
  deleteSubscription,
  deliverHoroscope,
  dropExpiredBirths,
  dueSubscriptions,
  forgetTelegramSubscriptions,
  latestHoroscope,
  manageToken,
  subscriptionBirth,
  subscriptionFromToken,
  telegramCodeForSubscription,
  updateSubscription,
} from './subscriptions';
import { contentDisposition, documentFilename } from './filename';
import { type CheckoutSession, createCheckoutSession } from './stripe';
import { json, readJson } from './http';
import { InvalidField, type OrderInput, parseOrder } from './validate';
import { errorCode } from './errors';
import { advance, apiFetch, type JobPayload, loadBirth } from './pipeline';
import { MAX_DELIVERIES, settleFailedJob } from './pro/lifecycle';
import { handlePro } from './pro/routes';
import { stripeWebhook } from './webhook';

/** A queue invocation gets thirty seconds of CPU but far more wall time; sections take ~30 s each,
 * so we stop writing after four minutes and let the message come back for the rest. */
const PASS_BUDGET_MS = 4 * 60 * 1000;

interface PreviewRequest {
  facts: Record<string, unknown>;
  lang: string;
  gender?: 'f' | 'm' | 'n';
  product?: string;
  first_name?: string;
  second_name?: string;
}

/** The free passages shown before payment.
 *
 * Cached by the chart they describe: a reload, a second tab or a visitor who comes back tomorrow
 * costs nothing, and the wait disappears entirely the second time. Nothing identifying goes into
 * the key — it is a hash of the birth moment, the place and the language. */
async function previewText(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as PreviewRequest;
  // A synastry payload carries two charts and has no `birth` of its own.
  const facts = body.facts ?? {};
  const first = ((facts.first as Record<string, unknown>)?.birth ?? facts.birth ?? {}) as Record<
    string,
    unknown
  >;
  const second = ((facts.second as Record<string, unknown>)?.birth ?? {}) as Record<
    string,
    unknown
  >;
  if (!first.date) return json({ error: 'facts are required' }, 400);

  const moment = (b: Record<string, unknown>) =>
    b.date ? [b.date, b.time ?? '', b.zone, b.latitude, b.longitude].join('|') : '';
  const key = await sha256Hex(
    new TextEncoder().encode(
      [
        body.product ?? 'natal',
        moment(first),
        moment(second),
        body.lang,
        body.gender ?? 'n',
      ].join('#'),
    ).buffer as ArrayBuffer,
  );

  const hit = await cachedPreview(env.DB, key);
  if (hit) {
    return json({ blocks: JSON.parse(hit.blocks), cached: true });
  }

  let upstream: Response;
  try {
    upstream = await apiFetch(env, '/v1/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
    blocks: { title: string; text: string }[];
    cost_micros: number;
    model: string;
  };
  await cachePreview(
    env.DB,
    {
      key,
      lang: body.lang,
      blocks: JSON.stringify(result.blocks),
      cost_micros: result.cost_micros,
      model: result.model,
    },
    Number(env.RETENTION_DAYS ?? '30'),
  );
  return json({ blocks: result.blocks, cached: false });
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
      display_name: person.name,
      place_label: person.place,
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

async function jobStatus(env: Env, token: string): Promise<Response> {
  const claims = await readLink('order', token, env.LINK_KEY);
  if (!claims) return json({ error: 'link expired' }, 404);

  const job = await getJob(env.DB, claims.job);
  if (!job || job.order_id !== claims.order) return json({ error: 'not found' }, 404);
  const order = await orderState(env.DB, job.order_id);
  if (!order || order.pro_account_id) return json({ error: 'not found' }, 404);

  const payload: JobPayload = job.payload ? (JSON.parse(job.payload) as JobPayload) : {};
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

async function subscribe(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    email?: string;
    locale?: string;
    cadence?: string;
    birth?: Parameters<typeof createSubscription>[1]['birth'];
  };
  if (!body.birth?.date || !body.birth?.zone) return json({ error: 'birth data is required' }, 400);
  if (!body.email) return json({ error: 'email is required' }, 400);
  if (!body.cadence || !CADENCES.has(body.cadence)) return json({ error: 'cadence' }, 400);
  const id = await createSubscription(env, {
    email: body.email,
    locale: body.locale ?? 'uk',
    cadence: body.cadence as Cadence,
    birth: body.birth,
  });
  // The first horoscope is written right away — a subscription that says "see you next week"
  // gives nothing to judge it by.
  await env.JOBS.send({ subscriptionId: id });
  const token = await manageToken(env, id);
  return json({ token }, 201);
}

async function subscriptionView(env: Env, token: string): Promise<Response> {
  const sub = await subscriptionFromToken(env, token);
  if (!sub) return json({ error: 'link expired' }, 404);
  const latest = await latestHoroscope(env.DB, sub.id);
  const birth = await subscriptionBirth(env, sub);
  return json({
    status: sub.status,
    cadence: sub.cadence,
    email: sub.email,
    locale: sub.locale,
    name: sub.display_name,
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
  const body = (await request.json()) as { cadence?: string; status?: string };
  const patch: { cadence?: Cadence; status?: 'active' | 'paused' | 'cancelled' } = {};
  if (body.cadence && CADENCES.has(body.cadence)) patch.cadence = body.cadence as Cadence;
  if (body.status === 'active' || body.status === 'paused' || body.status === 'cancelled') {
    patch.status = body.status;
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
    await claimTelegramLink(this.env.DB, link.code, chatId);
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
  if (!env.SITE_KEY) {
    console.error('SITE_KEY is not configured; refusing site routes');
    return json({ error: 'unavailable' }, 503);
  }
  if (!(await sameSecret(request.headers.get('x-site-key'), env.SITE_KEY))) {
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

    // The site asks for the code behind its Telegram link; the token names the order.
    const code = url.pathname.match(/^\/v1\/jobs\/(.+)\/telegram$/);
    if (code?.[1] && request.method === 'POST') return telegramCode(env, code[1]);

    if (url.pathname === '/v1/subscriptions' && request.method === 'POST') {
      return subscribe(request, env);
    }
    const subscription = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/);
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
    const status = url.pathname.match(/^\/v1\/jobs\/(.+)$/);
    if (status?.[1]) return jobStatus(env, status[1]);
    const file = url.pathname.match(/^\/d\/(.+)$/);
    if (file?.[1]) return download(env, file[1]);

    return new Response('not found', { status: 404 });
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
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
      const job = await getJob(env.DB, message.body.jobId);
      if (!job || job.status === 'done') {
        message.ack();
        continue;
      }
      try {
        await updateJob(env.DB, job.id, {
          status: 'running',
          attempts: job.attempts + 1,
          last_error: null,
        });
        const finished = await advance(env, job, Date.now() + PASS_BUDGET_MS);
        if (!finished) {
          // More sections to write: a fresh message rather than a long-running invocation.
          await env.JOBS.send({ jobId: job.id });
        }
        message.ack();
      } catch (error) {
        const reason = errorCode(error);
        await updateJob(env.DB, job.id, { status: 'failed', last_error: reason });
        console.error('job failed', job.id, reason);
        // Retry with the queue's backoff; the work already banked in payload is not repeated.
        if (message.attempts >= MAX_DELIVERIES) {
          try {
            if (await settleFailedJob(env, job.id)) {
              // A seller's reading is settled here rather than left in the dead-letter queue.
              message.ack();
              continue;
            }
          } catch (settleError) {
            console.error('settling a failed reading', job.id, errorCode(settleError));
          }
        }
        message.retry();
      }
    }
  },

  /** Hourly: horoscopes that are due go to the queue. Nightly: retention — birth data and
   * documents are deleted thirty days after the order, subscriptions lose their birth data
   * after the correction window. Orders and charts stay. */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === '5 * * * *') {
      const due = await dueSubscriptions(env.DB);
      for (const { id } of due) await env.JOBS.send({ subscriptionId: id });
      console.log(`horoscopes: ${due.length} due`);
      return;
    }
    await dropExpiredBirths(env.DB);
    const scrubbed = await scrubExpiredJobPayloads(env.DB, Number(env.RETENTION_DAYS ?? '30'));
    const stale = await expired(env.DB);
    for (const row of stale.results ?? []) {
      await env.DOCS.delete(row.storage_key);
    }
    await env.DB.prepare('DELETE FROM documents WHERE expires_at < ?').bind(now()).run();
    await env.DB.prepare('DELETE FROM charts WHERE expires_at < ?').bind(now()).run();
    await env.DB.prepare('DELETE FROM previews WHERE expires_at < ?').bind(now()).run();
    // Sign-in links are worth nothing a day after they expire; the hour of history the throttle
    // needs is long past by then.
    await env.DB.prepare('DELETE FROM pro_login_tokens WHERE expires_at < ?')
      .bind(new Date(Date.now() - 86_400_000).toISOString())
      .run();
    console.log(`retention: removed ${stale.results?.length ?? 0} documents, cleared ${scrubbed} job payloads`);
  },
};
