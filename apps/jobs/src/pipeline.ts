/** Turning an order into a PDF: calculate, write, render, store.
 *
 * Every step writes its result into the job row before the next one starts, so a retry resumes
 * from where it stopped instead of paying the model twice for the same section.
 */

import { type Blobish, decryptJson, encryptJson, LINK_TTL_SECONDS, sha256Hex, signLink } from './crypto';
import {
  expiryFrom,
  insertDocument,
  insertEmailEvent,
  type JobRow,
  orderContact,
  type Product,
  telegramWaiting,
  updateJob,
} from './db';
import type { Env } from './env';
import { errorCode, JobError, UpstreamError } from './errors';
import { sendReady } from './mail';
import { brandForDocument } from './pro/brand';

export interface BirthData {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  name: string;
  gender: 'f' | 'm' | 'n';
  lang: string;
}

export interface SectionPlan {
  id: string;
  title: string;
  quote: boolean;
}

export interface WrittenSection extends SectionPlan {
  text: string;
  problems: string[];
  attempts: number;
  tokens_in: number;
  tokens_out: number;
  cost_micros: number;
  model: string;
}

/** What survives between steps: the calculated chart and every text written from it. */
export interface JobPayload {
  facts?: Record<string, unknown>;
  transits?: unknown[];
  plan?: SectionPlan[];
  sections?: WrittenSection[];
}

/** The columns a job's payload lives in: AES-GCM ciphertext and nonce under DATA_KEY, like the
 * birth data, or plain JSON in rows written before the payload was encrypted. */
export interface PayloadColumns {
  payload: string | null;
  payload_ct: Blobish | null;
  payload_nonce: Blobish | null;
}

/** A job's payload, whichever way its row holds it. Every write below empties the plain column as
 * it stores the ciphertext, so a row holding both had its plain text written afterwards, by a
 * worker from before the encryption: the plain text is the newer of the two. */
export async function openPayload(env: Env, row: PayloadColumns): Promise<JobPayload> {
  if (row.payload) return JSON.parse(row.payload) as JobPayload;
  if (row.payload_ct && row.payload_nonce) {
    return decryptJson<JobPayload>(row.payload_ct, row.payload_nonce, env.DATA_KEY);
  }
  return {};
}

/** The columns to write a payload to: encrypted, with the plain column emptied. Every writer of
 * a payload uses this and nothing else. */
export async function sealPayload(
  env: Env,
  payload: JobPayload,
): Promise<{ payload: null; payload_ct: ArrayBuffer; payload_nonce: ArrayBuffer }> {
  const { ciphertext, nonce } = await encryptJson(payload, env.DATA_KEY);
  return { payload: null, payload_ct: ciphertext, payload_nonce: nonce };
}

/** Encrypts up to `limit` payloads still stored in plain text; the nightly sweep calls it until
 * none are left. A row rewritten meanwhile is left for the next run. */
export async function sealLegacyPayloads(env: Env, limit: number): Promise<number> {
  const { results } = await env.DB.prepare('SELECT id, payload FROM jobs WHERE payload IS NOT NULL LIMIT ?')
    .bind(limit)
    .all<{ id: string; payload: string }>();
  let sealed = 0;
  for (const row of results) {
    let parsed: JobPayload;
    try {
      parsed = JSON.parse(row.payload) as JobPayload;
    } catch {
      console.error('unreadable payload left as it is', row.id);
      continue;
    }
    const columns = await sealPayload(env, parsed);
    const result = await env.DB.prepare(
      'UPDATE jobs SET payload = NULL, payload_ct = ?, payload_nonce = ? WHERE id = ? AND payload = ?',
    )
      .bind(columns.payload_ct, columns.payload_nonce, row.id, row.payload)
      .run();
    sealed += result.meta.changes ?? 0;
  }
  return sealed;
}

/** The ephemeris service: charts, synastry, transits, the sky. Public and AGPL, ours by binding. */
export const ephemeris = async <T>(env: Env, path: string, body: unknown): Promise<T> => {
  const response = await env.EPHEMERIS.fetch(`https://ephemeris${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new UpstreamError(`ephemeris ${path}`, response.status);
  return response.json() as Promise<T>;
};

/** Every call to the text-and-document API, which refuses anything without NATALKA_API_KEY in
 * x-api-key. Without the secret nothing is sent at all. */
export async function apiFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  if (!env.NATALKA_API_KEY) throw new JobError('NATALKA_API_KEY is not configured');
  const headers = new Headers(init.headers);
  headers.set('x-api-key', env.NATALKA_API_KEY);
  return env.API.fetch(`${env.NATALKA_API_URL}${path}`, { ...init, headers });
}

const api = async <T>(env: Env, path: string, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(env, path, init);
  if (!response.ok) {
    // The body is read only to tell a section the API no longer knows from any other refusal.
    const unknownSection = response.status === 404 && (await response.text()).includes('unknown section');
    throw new UpstreamError(path.split('?')[0] ?? path, response.status, unknownSection);
  }
  return (await response.json()) as T;
};

export async function loadBirth(env: Env, orderId: string, personNo = 1): Promise<BirthData> {
  const row = await env.DB.prepare(
    'SELECT birth_ciphertext, birth_nonce FROM charts WHERE order_id = ? AND person_no = ?',
  )
    .bind(orderId, personNo)
    .first<{ birth_ciphertext: Blobish; birth_nonce: Blobish }>();
  if (!row) throw new JobError(`no chart ${personNo} for order ${orderId}`);
  return decryptJson<BirthData>(row.birth_ciphertext, row.birth_nonce, env.DATA_KEY);
}

/** Whose order this is: a shopper's (null) or a seller's account. */
export async function proAccountOf(db: D1Database, orderId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT pro_account_id FROM orders WHERE id = ?')
    .bind(orderId)
    .first<{ pro_account_id: string | null }>();
  return row?.pro_account_id ?? null;
}

/** The people a job is about, decrypted. */
export async function loadPeople(env: Env, job: Pick<JobRow, 'order_id' | 'kind'>): Promise<People> {
  return {
    first: await loadBirth(env, job.order_id),
    second: job.kind === 'synastry' ? await loadBirth(env, job.order_id, 2) : null,
  };
}

/** Removes an order's PDFs: the objects first, then the rows that point at them. A seller's PDF
 * is replaced when it is assembled again and goes stale when a section is rewritten. `keep` names
 * the one document to leave in place: the PDF that has just replaced the others. */
export async function dropDocuments(env: Env, orderId: string, keep?: string): Promise<void> {
  const { results } = await env.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ? AND id IS NOT ?')
    .bind(orderId, keep ?? null)
    .all<{ storage_key: string }>();
  for (const row of results) await env.DOCS.delete(row.storage_key);
  await env.DB.prepare('DELETE FROM documents WHERE order_id = ? AND id IS NOT ?').bind(orderId, keep ?? null).run();
}

/** "Оксана і Ігор" on the cover of a synastry. */
const AND: Record<string, string> = { uk: 'і', ru: 'и', en: 'and', pl: 'i', de: 'und' };

/** The text API takes a name of at most 80 characters, the two names of a synastry cover
 * included; an order or a subscription from before names were limited may carry a longer one. */
export const clampName = (name: string): string => [...name].slice(0, 80).join('').trim();

/** The people a job is about: one, or two for a synastry. */
export interface People {
  first: BirthData;
  second: BirthData | null;
}

const birthBody = (b: BirthData) => ({
  date: b.date,
  time: b.time,
  latitude: b.latitude,
  longitude: b.longitude,
  zone: b.zone,
});

/** How far ahead each product looks. Transits are the slowest part of the calculation, and a
 * natal reading never mentions them, so it does not pay for them. */
const TRANSIT_YEARS: Record<string, number> = {
  natal: 0,
  synastry: 0,
  forecast: 2,
  child: 3,
  bundle: 3,
};

/** `&address=ty` for a seller's reading in the informal form; nothing for the default, so a
 * shopper's requests are exactly what they were. */
const addressParam = (address: 'vy' | 'ty') => (address === 'ty' ? `&address=${address}` : '');

async function calculate(
  env: Env,
  job: JobRow,
  people: People,
  address: 'vy' | 'ty',
): Promise<JobPayload> {
  const { first: birth, second } = people;
  if (job.kind === 'synastry' && second) {
    // Two charts and the contacts between them; no transits, a synastry has no calendar.
    const facts = await ephemeris<Record<string, unknown>>(env, '/v1/synastry', {
      first: birthBody(birth),
      second: birthBody(second),
    });
    const unknownTime = birth.time === null || second.time === null;
    const plan = await api<{ sections: SectionPlan[] }>(
      env,
      `/v1/sections?product=synastry&lang=${birth.lang}&unknown_time=${unknownTime}${addressParam(address)}`,
    );
    return { facts, transits: [], plan: plan.sections, sections: [] };
  }

  const facts = await ephemeris<Record<string, unknown> & { transits?: unknown[] }>(
    env,
    '/v1/calc',
    { ...birthBody(birth), transit_years: TRANSIT_YEARS[job.kind] ?? 3 },
  );
  const transits = facts.transits ?? [];
  delete facts.transits;

  const unknownTime = Boolean((facts.birth as { unknown_time?: boolean }).unknown_time);
  const plan = await api<{ sections: SectionPlan[] }>(
    env,
    `/v1/sections?product=${job.kind}&lang=${birth.lang}&unknown_time=${unknownTime}${addressParam(address)}`,
  );
  return { facts, transits, plan: plan.sections, sections: [] };
}

/** Writes one section, with the others as context. Throws on any API error. */
export async function writeSection(
  env: Env,
  kind: Product,
  people: People,
  payload: JobPayload,
  sectionId: string,
  others: WrittenSection[],
  address: 'vy' | 'ty' = 'vy',
): Promise<WrittenSection> {
  const { first: birth, second } = people;
  return api<WrittenSection>(env, '/v1/section', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      facts: payload.facts,
      transits: payload.transits ?? [],
      section_id: sectionId,
      product: kind,
      lang: birth.lang,
      name: clampName(birth.name),
      gender: birth.gender,
      second_name: clampName(second?.name ?? ''),
      written_so_far: others.map((s) => `${s.title}: ${s.text.slice(0, 160)}…`),
      ...(address === 'vy' ? {} : { address }),
    }),
  });
}

/** Writes the sections that are still missing, oldest first, and stops when the budget runs out.
 *
 * The queue message is re-sent rather than held open for the whole document: a reading is fifteen
 * minutes of model calls and a Worker invocation is not allowed to run that long. Each pass writes
 * as many sections as it safely can and hands the rest to the next attempt. */
async function writeSections(
  env: Env,
  job: JobRow,
  people: People,
  payload: JobPayload,
  deadline: number,
  address: 'vy' | 'ty',
): Promise<{ payload: JobPayload; done: boolean }> {
  const plan = payload.plan ?? [];
  const sections = payload.sections ?? [];
  const written = new Set(sections.map((s) => s.id));
  // Chapters the text API no longer knows. They leave the saved plan too, so a seller's reading
  // is not left with a section that can never be written.
  const gone = new Set<string>();
  const current = (): JobPayload => ({ ...payload, plan: plan.filter((p) => !gone.has(p.id)), sections });

  for (const entry of plan) {
    if (written.has(entry.id)) continue;
    if (Date.now() > deadline) return { payload: current(), done: false };

    let section: WrittenSection;
    try {
      section = await writeSection(env, job.kind, people, payload, entry.id, sections, address);
    } catch (error) {
      // A deploy can land between the plan and the writing, and the chapter this job was told
      // to write may no longer exist. Skipping it finishes the document; failing the job would
      // throw away everything written so far.
      if (error instanceof UpstreamError && error.unknownSection) {
        console.warn('section gone since the plan was made', entry.id);
        gone.add(entry.id);
        continue;
      }
      throw error;
    }
    sections.push(section);

    // Cost is banked after every section: an order that fails halfway still shows what it spent.
    await updateJob(env.DB, job.id, {
      ...(await sealPayload(env, current())),
      tokens_in: sections.reduce((n, s) => n + s.tokens_in, 0),
      tokens_out: sections.reduce((n, s) => n + s.tokens_out, 0),
      cost_micros: sections.reduce((n, s) => n + s.cost_micros, 0),
      model: section.model,
    });
  }
  return { payload: current(), done: true };
}

async function render(
  env: Env,
  job: JobRow,
  people: People,
  payload: JobPayload,
  seller: { accountId: string; address: 'vy' | 'ty' } | null,
): Promise<void> {
  const { first: birth, second } = people;
  // The sections were written from the whole synastry payload; the skeleton draws one chart per
  // slot, so the pair is split here, and the cover carries both names.
  const pair =
    job.kind === 'synastry'
      ? (payload.facts as { first: Record<string, unknown>; second: Record<string, unknown> })
      : null;
  const name = clampName(pair && second ? `${birth.name} ${AND[birth.lang] ?? '&'} ${second.name}` : birth.name);
  const brand = seller ? await brandForDocument(env, seller.accountId) : null;
  if (seller && !brand) throw new JobError(`no brand for seller of order ${job.order_id}`);
  const document = await api<Record<string, unknown>>(env, '/v1/skeleton', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      facts: pair ? pair.first : payload.facts,
      facts_second: pair ? pair.second : null,
      transits: payload.transits ?? [],
      product: job.kind,
      lang: birth.lang,
      name,
      gender: birth.gender,
      place: birth.place,
      order_ref: job.order_id,
      ...(seller ? { brand, address: seller.address } : {}),
      sections: (payload.sections ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        text: s.text,
        quote: s.quote,
      })),
    }),
  });
  // An API image older than the jobs worker ignores the fields it does not know, and would
  // assemble a seller's reading under our name with the order reference on it. Refuse it here
  // rather than hand that PDF to the seller's client.
  if (seller) {
    const meta = document.meta as { order_ref?: string | null } | undefined;
    if (!document.brand || meta?.order_ref != null) {
      throw new JobError(
        `/v1/skeleton returned no seller brand for order ${job.order_id}: the API image is older than the jobs worker`,
      );
    }
  }

  const pdf = await apiFetch(env, '/v1/document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!pdf.ok) throw new UpstreamError('/v1/document', pdf.status);
  const pages = Number(pdf.headers.get('x-pages') ?? 0);
  const bytes = await pdf.arrayBuffer();

  // A seller's PDF is rebuilt in place of the last one, so it gets a key of its own: the previous
  // PDF stays readable until this one is stored, and only then is it removed.
  const key = seller
    ? `${job.order_id}/${job.kind}-${birth.lang}-${crypto.randomUUID()}.pdf`
    : `${job.order_id}/${job.kind}-${birth.lang}.pdf`;
  const id = crypto.randomUUID();
  await env.DOCS.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  try {
    await insertDocument(env.DB, {
      id,
      order_id: job.order_id,
      storage_key: key,
      sha256: await sha256Hex(bytes),
      pages,
      bytes: bytes.byteLength,
      lang: birth.lang,
      expires_at: expiryFrom(Number(env.RETENTION_DAYS ?? '30')),
    });
  } catch (error) {
    // A PDF no row points at would never be swept: take it out again before the retry.
    try {
      await env.DOCS.delete(key);
    } catch (deleteError) {
      console.error('removing a PDF that has no row', job.id, errorCode(deleteError));
    }
    throw error;
  }
  if (seller) await dropDocuments(env, job.order_id, id);
}

/** One pass over a job. Returns true when the document is finished.
 *
 * A seller's reading whose credits were refunded is never run again: the job stays 'failed', so a
 * duplicate or redriven delivery (or a send that threw yet did enqueue) would otherwise write a
 * reading nobody paid for. */
export async function advance(env: Env, job: JobRow, deadline: number): Promise<boolean> {
  const order = await env.DB.prepare(
    `SELECT o.pro_account_id, r.refunded_at, r.address
     FROM orders o LEFT JOIN pro_readings r ON r.order_id = o.id
     WHERE o.id = ?`,
  )
    .bind(job.order_id)
    .first<{ pro_account_id: string | null; refunded_at: string | null; address: 'vy' | 'ty' | null }>();
  const seller = order?.pro_account_id ?? null;
  const address = order?.address ?? 'vy';
  if (seller && order?.refunded_at) return true;
  const people = await loadPeople(env, job);
  let payload = await openPayload(env, job);

  if (job.step === 'calc') {
    payload = await calculate(env, job, people, address);
    await updateJob(env.DB, job.id, {
      step: 'texts',
      status: 'running',
      ...(await sealPayload(env, payload)),
    });
    job = { ...job, step: 'texts' };
  }

  if (job.step === 'texts') {
    const result = await writeSections(env, job, people, payload, deadline, address);
    payload = result.payload;
    if (!result.done) {
      await updateJob(env.DB, job.id, await sealPayload(env, payload));
      return false;
    }
    if (seller) {
      // A seller reads the texts first and asks for the PDF when they are happy with them.
      await updateJob(env.DB, job.id, { step: 'done', status: 'done', ...(await sealPayload(env, payload)) });
      return true;
    }
    await updateJob(env.DB, job.id, { step: 'pdf', ...(await sealPayload(env, payload)) });
    job = { ...job, step: 'pdf' };
  }

  if (job.step === 'pdf') {
    if (seller) {
      // The new PDF replaces the old one only once it is stored: a failed render keeps the last.
      await render(env, job, people, payload, { accountId: seller, address });
      // The seller delivers the reading themselves: no letter, no bot.
      await updateJob(env.DB, job.id, { step: 'done', status: 'done' });
      return true;
    }
    await render(env, job, people, payload, null);
    await updateJob(env.DB, job.id, { step: 'email' });
    job = { ...job, step: 'email' };
  }

  if (job.step === 'email') {
    await notify(env, job);
    await updateJob(env.DB, job.id, { step: 'done', status: 'done' });
  }
  return true;
}

/** The ready letter. Its own step, after the document exists: a provider outage then costs a
 * retry of one POST, not of fifteen minutes of writing. */
async function notify(env: Env, job: JobRow): Promise<void> {
  const contact = await orderContact(env.DB, job.order_id);
  if (!contact) throw new JobError(`no order for job ${job.id}`);
  const token = await signLink('order', { order: job.order_id, job: job.id }, env.LINK_KEY, LINK_TTL_SECONDS);
  const link = `${env.SITE_URL}/${contact.locale}/generating?t=${token}`;
  const sent = await sendReady(env, contact.email, contact.locale, link);
  await insertEmailEvent(env.DB, {
    order_id: job.order_id,
    kind: 'ready',
    provider_id: sent.providerId,
    status: sent.status,
  });

  // Whoever opened the bot while the document was being written gets it there as well. A failure
  // here is logged, not thrown: the letter has gone and the download works, and the bot can be
  // asked again.
  for (const waiting of await telegramWaiting(env.DB, job.order_id)) {
    try {
      if (waiting.chat_id === null) continue;
      await env.BOT.deliver({
        chatId: waiting.chat_id,
        code: waiting.code,
        locale: waiting.locale,
        token,
      });
    } catch (error) {
      console.error('telegram delivery', job.id, errorCode(error));
    }
  }
}
