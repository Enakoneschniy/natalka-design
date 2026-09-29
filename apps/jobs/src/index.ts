/**
 * The order pipeline: takes birth data, returns a PDF.
 *
 * The web app never talks to the calculation API or the model directly — it creates an order here
 * and polls. Everything that costs money or touches personal data happens in this Worker, which is
 * the only place with the database, the bucket and the keys.
 */

import { encryptJson, LINK_TTL_SECONDS, sha256Hex, signToken, verifyToken } from './crypto';
import {
  cachePreview,
  claimTelegramLink,
  forgetTelegramChat,
  markTelegramDelivered,
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
  type Product,
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
import { advance, type JobPayload, loadBirth } from './pipeline';

/** A queue invocation gets thirty seconds of CPU but far more wall time; sections take ~30 s each,
 * so we stop writing after four minutes and let the message come back for the rest. */
const PASS_BUDGET_MS = 4 * 60 * 1000;

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

interface CreateOrder {
  email: string;
  product: Product;
  locale: string;
  country?: string;
  amount_minor: number;
  currency: string;
  /** Marks a run that was not paid for — the staging site creates these. */
  test?: boolean;
  birth: BirthInput;
  /** The partner. Only a synastry has one; anything else ignores it. */
  birth_second?: BirthInput;
}

interface BirthInput {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  name: string;
  gender: 'f' | 'm' | 'n';
}

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

  const upstream = await env.API.fetch(`${env.NATALKA_API_URL}/v1/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

async function createOrder(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as CreateOrder;
  if (!body?.email || !body?.birth?.date || !body?.birth?.zone) {
    return json({ error: 'email and birth data are required' }, 400);
  }
  if (body.product === 'synastry' && !(body.birth_second?.date && body.birth_second?.zone)) {
    return json({ error: 'a synastry needs two people' }, 400);
  }

  const orderId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const retention = Number(env.RETENTION_DAYS ?? '30');

  await insertOrder(env.DB, {
    id: orderId,
    email: body.email,
    product: body.product,
    locale: body.locale,
    country: body.country ?? null,
    amount_minor: body.amount_minor,
    currency: body.currency,
    status: body.test ? 'test' : 'pending',
    created_at: now(),
  });

  // One encrypted row per person; the second exists only for a synastry.
  const people = body.product === 'synastry' && body.birth_second ? [body.birth, body.birth_second] : [body.birth];
  for (const [index, person] of people.entries()) {
    const { ciphertext, nonce } = await encryptJson({ ...person, lang: body.locale }, env.DATA_KEY);
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

  await insertJob(env.DB, { id: jobId, order_id: orderId, kind: body.product });
  await env.JOBS.send({ jobId });

  // The token is the only thing the browser needs afterwards: it names the order and expires.
  const token = await signToken({ order: orderId, job: jobId }, env.LINK_KEY, LINK_TTL_SECONDS);
  return json({ order_id: orderId, job_id: jobId, token }, 201);
}

async function jobStatus(env: Env, token: string): Promise<Response> {
  const claims = await verifyToken<{ order: string; job: string }>(token, env.LINK_KEY);
  if (!claims) return json({ error: 'link expired' }, 404);

  const job = await getJob(env.DB, claims.job);
  if (!job) return json({ error: 'not found' }, 404);

  const payload: JobPayload = job.payload ? (JSON.parse(job.payload) as JobPayload) : {};
  const total = payload.plan?.length ?? 0;
  const written = payload.sections?.length ?? 0;
  const document = job.step === 'done' ? await documentForOrder(env.DB, job.order_id) : null;

  return json({
    step: job.step,
    status: job.status,
    written,
    total,
    // Calculation is quick and rendering is a few seconds; the text is the whole wait.
    progress: total ? Math.round((written / total) * 100) : 0,
    error: job.last_error,
    pages: document?.pages ?? null,
    download: document ? `/d/${token}` : null,
  });
}

/** The finished PDF and the name it should carry, for a valid token. */
async function finishedDocument(
  env: Env,
  token: string,
): Promise<{ body: ReadableStream; filename: string } | Response> {
  const claims = await verifyToken<{ order: string; job: string }>(token, env.LINK_KEY);
  if (!claims) return new Response('link expired', { status: 404 });

  const document = await documentForOrder(env.DB, claims.order);
  if (!document) return new Response('not ready', { status: 404 });

  const object = await env.DOCS.get(document.storage_key);
  if (!object) return new Response('gone', { status: 410 });

  const job = await getJob(env.DB, claims.job);
  const product = job?.kind ?? 'natal';
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
  const claims = await verifyToken<{ order: string; job: string }>(token, env.LINK_KEY);
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
      ? await signToken(
          { order: link.order_id, job: link.job_id },
          this.env.LINK_KEY,
          LINK_TTL_SECONDS,
        )
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The site asks for the code behind its Telegram link; the token is the authentication.
    const code = url.pathname.match(/^\/v1\/jobs\/(.+)\/telegram$/);
    if (code?.[1] && request.method === 'POST') return telegramCode(env, code[1]);

    if (url.pathname === '/health') return json({ status: 'ok' });
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
          console.error('horoscope failed', message.body.subscriptionId, error);
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
        const reason = error instanceof Error ? error.message : String(error);
        await updateJob(env.DB, job.id, { status: 'failed', last_error: reason.slice(0, 500) });
        console.error('job failed', job.id, reason);
        // Retry with the queue's backoff; the work already banked in payload is not repeated.
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
    const stale = await expired(env.DB);
    for (const row of stale.results ?? []) {
      await env.DOCS.delete(row.storage_key);
    }
    await env.DB.prepare('DELETE FROM documents WHERE expires_at < ?').bind(now()).run();
    await env.DB.prepare('DELETE FROM charts WHERE expires_at < ?').bind(now()).run();
    await env.DB.prepare('DELETE FROM previews WHERE expires_at < ?').bind(now()).run();
    console.log(`retention: removed ${stale.results?.length ?? 0} documents`);
  },
};
