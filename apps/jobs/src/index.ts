/**
 * The order pipeline: takes birth data, returns a PDF.
 *
 * The web app never talks to the calculation API or the model directly — it creates an order here
 * and polls. Everything that costs money or touches personal data happens in this Worker, which is
 * the only place with the database, the bucket and the keys.
 */

import { encryptJson, sha256Hex, signToken, verifyToken } from './crypto';
import {
  cachePreview,
  cachedPreview,
  documentForOrder,
  expired,
  expiryFrom,
  getJob,
  insertChart,
  insertJob,
  insertOrder,
  now,
  type Product,
  updateJob,
} from './db';
import type { Env } from './env';
import { advance, type JobPayload } from './pipeline';

/** A queue invocation gets thirty seconds of CPU but far more wall time; sections take ~30 s each,
 * so we stop writing after four minutes and let the message come back for the rest. */
const PASS_BUDGET_MS = 4 * 60 * 1000;
const LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

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
  birth: {
    date: string;
    time: string | null;
    latitude: number;
    longitude: number;
    zone: string;
    place: string;
    name: string;
    gender: 'f' | 'm' | 'n';
  };
}

interface PreviewRequest {
  facts: Record<string, unknown>;
  lang: string;
  gender?: 'f' | 'm' | 'n';
}

/** The free passages shown before payment.
 *
 * Cached by the chart they describe: a reload, a second tab or a visitor who comes back tomorrow
 * costs nothing, and the wait disappears entirely the second time. Nothing identifying goes into
 * the key — it is a hash of the birth moment, the place and the language. */
async function previewText(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as PreviewRequest;
  const birth = (body.facts?.birth ?? {}) as Record<string, unknown>;
  if (!birth.date) return json({ error: 'facts are required' }, 400);

  const key = await sha256Hex(
    new TextEncoder().encode(
      [birth.date, birth.time ?? '', birth.zone, birth.latitude, birth.longitude, body.lang,
        body.gender ?? 'n'].join('|'),
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

  const { ciphertext, nonce } = await encryptJson(
    { ...body.birth, lang: body.locale },
    env.DATA_KEY,
  );
  await insertChart(env.DB, {
    id: crypto.randomUUID(),
    order_id: orderId,
    ciphertext,
    nonce,
    unknown_time: body.birth.time === null,
    gender: body.birth.gender,
    display_name: body.birth.name,
    place_label: body.birth.place,
    expires_at: expiryFrom(retention),
  });

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

async function download(env: Env, token: string): Promise<Response> {
  const claims = await verifyToken<{ order: string }>(token, env.LINK_KEY);
  if (!claims) return new Response('link expired', { status: 404 });

  const document = await documentForOrder(env.DB, claims.order);
  if (!document) return new Response('not ready', { status: 404 });

  const object = await env.DOCS.get(document.storage_key);
  if (!object) return new Response('gone', { status: 410 });

  return new Response(object.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="chronika.pdf"',
      'cache-control': 'private, no-store',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') return json({ status: 'ok' });
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

  async queue(batch: MessageBatch<{ jobId: string }>, env: Env): Promise<void> {
    for (const message of batch.messages) {
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

  /** Retention: birth data and documents are deleted thirty days after the order. Orders stay. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
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
