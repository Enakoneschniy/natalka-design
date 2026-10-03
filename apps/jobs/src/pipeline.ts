/** Turning an order into a PDF: calculate, write, render, store.
 *
 * Every step writes its result into the job row before the next one starts, so a retry resumes
 * from where it stopped instead of paying the model twice for the same section.
 */

import { type Blobish, decryptJson, LINK_TTL_SECONDS, sha256Hex, signToken } from './crypto';
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
import { sendReady } from './mail';

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

/** What survives between steps; stored as JSON in `jobs.payload`. */
export interface JobPayload {
  facts?: Record<string, unknown>;
  transits?: unknown[];
  plan?: SectionPlan[];
  sections?: WrittenSection[];
}

/** The ephemeris service: charts, synastry, transits, the sky. Public and AGPL, ours by binding. */
export const ephemeris = async <T>(env: Env, path: string, body: unknown): Promise<T> => {
  const response = await env.EPHEMERIS.fetch(`https://ephemeris${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`ephemeris ${path} → ${response.status}`);
  return response.json() as Promise<T>;
};

const api = async <T>(env: Env, path: string, init?: RequestInit): Promise<T> => {
  const response = await env.API.fetch(`${env.NATALKA_API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`${path} → ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T;
};

export async function loadBirth(env: Env, orderId: string, personNo = 1): Promise<BirthData> {
  const row = await env.DB.prepare(
    'SELECT birth_ciphertext, birth_nonce FROM charts WHERE order_id = ? AND person_no = ?',
  )
    .bind(orderId, personNo)
    .first<{ birth_ciphertext: Blobish; birth_nonce: Blobish }>();
  if (!row) throw new Error(`no chart ${personNo} for order ${orderId}`);
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
 * is replaced when it is assembled again and goes stale when a section is rewritten. */
export async function dropDocuments(env: Env, orderId: string): Promise<void> {
  const { results } = await env.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ?')
    .bind(orderId)
    .all<{ storage_key: string }>();
  for (const row of results) await env.DOCS.delete(row.storage_key);
  await env.DB.prepare('DELETE FROM documents WHERE order_id = ?').bind(orderId).run();
}

/** "Оксана і Ігор" on the cover of a synastry. */
const AND: Record<string, string> = { uk: 'і', ru: 'и', en: 'and', pl: 'i', de: 'und' };

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

async function calculate(env: Env, job: JobRow, people: People): Promise<JobPayload> {
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
      `/v1/sections?product=synastry&lang=${birth.lang}&unknown_time=${unknownTime}`,
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
    `/v1/sections?product=${job.kind}&lang=${birth.lang}&unknown_time=${unknownTime}`,
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
      name: birth.name,
      gender: birth.gender,
      second_name: second?.name ?? '',
      written_so_far: others.map((s) => `${s.title}: ${s.text.slice(0, 160)}…`),
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
): Promise<{ payload: JobPayload; done: boolean }> {
  const plan = payload.plan ?? [];
  const sections = payload.sections ?? [];
  const written = new Set(sections.map((s) => s.id));

  for (const entry of plan) {
    if (written.has(entry.id)) continue;
    if (Date.now() > deadline) return { payload: { ...payload, sections }, done: false };

    let section: WrittenSection;
    try {
      section = await writeSection(env, job.kind, people, payload, entry.id, sections);
    } catch (error) {
      // A deploy can land between the plan and the writing, and the chapter this job was told
      // to write may no longer exist. Skipping it finishes the document; failing the job would
      // throw away everything written so far.
      if (error instanceof Error && error.message.includes('unknown section')) {
        console.warn('section gone since the plan was made', entry.id);
        written.add(entry.id);
        continue;
      }
      throw error;
    }
    sections.push(section);

    // Cost is banked after every section: an order that fails halfway still shows what it spent.
    await updateJob(env.DB, job.id, {
      payload: JSON.stringify({ ...payload, sections }),
      tokens_in: sections.reduce((n, s) => n + s.tokens_in, 0),
      tokens_out: sections.reduce((n, s) => n + s.tokens_out, 0),
      cost_micros: sections.reduce((n, s) => n + s.cost_micros, 0),
      model: section.model,
    });
  }
  return { payload: { ...payload, sections }, done: true };
}

async function render(env: Env, job: JobRow, people: People, payload: JobPayload): Promise<void> {
  const { first: birth, second } = people;
  // The sections were written from the whole synastry payload; the skeleton draws one chart per
  // slot, so the pair is split here, and the cover carries both names.
  const pair =
    job.kind === 'synastry'
      ? (payload.facts as { first: Record<string, unknown>; second: Record<string, unknown> })
      : null;
  const name = pair && second ? `${birth.name} ${AND[birth.lang] ?? '&'} ${second.name}` : birth.name;
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
      sections: (payload.sections ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        text: s.text,
        quote: s.quote,
      })),
    }),
  });

  const pdf = await env.API.fetch(`${env.NATALKA_API_URL}/v1/document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!pdf.ok) throw new Error(`/v1/document → ${pdf.status}`);
  const pages = Number(pdf.headers.get('x-pages') ?? 0);
  const bytes = await pdf.arrayBuffer();

  const key = `${job.order_id}/${job.kind}-${birth.lang}.pdf`;
  await env.DOCS.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  await insertDocument(env.DB, {
    id: crypto.randomUUID(),
    order_id: job.order_id,
    storage_key: key,
    sha256: await sha256Hex(bytes),
    pages,
    bytes: bytes.byteLength,
    lang: birth.lang,
    expires_at: expiryFrom(Number(env.RETENTION_DAYS ?? '30')),
  });
}

/** One pass over a job. Returns true when the document is finished.
 *
 * A seller's reading whose credits were refunded is never run again: the job stays 'failed', so a
 * duplicate or redriven delivery (or a send that threw yet did enqueue) would otherwise write a
 * reading nobody paid for. */
export async function advance(env: Env, job: JobRow, deadline: number): Promise<boolean> {
  const order = await env.DB.prepare(
    `SELECT o.pro_account_id, r.refunded_at
     FROM orders o LEFT JOIN pro_readings r ON r.order_id = o.id
     WHERE o.id = ?`,
  )
    .bind(job.order_id)
    .first<{ pro_account_id: string | null; refunded_at: string | null }>();
  const seller = order?.pro_account_id ?? null;
  if (seller && order?.refunded_at) return true;
  const people = await loadPeople(env, job);
  let payload: JobPayload = job.payload ? (JSON.parse(job.payload) as JobPayload) : {};

  if (job.step === 'calc') {
    payload = await calculate(env, job, people);
    await updateJob(env.DB, job.id, {
      step: 'texts',
      status: 'running',
      payload: JSON.stringify(payload),
    });
    job = { ...job, step: 'texts' };
  }

  if (job.step === 'texts') {
    const result = await writeSections(env, job, people, payload, deadline);
    payload = result.payload;
    if (!result.done) {
      await updateJob(env.DB, job.id, { payload: JSON.stringify(payload) });
      return false;
    }
    if (seller) {
      // A seller reads the texts first and asks for the PDF when they are happy with them.
      await updateJob(env.DB, job.id, { step: 'done', status: 'done', payload: JSON.stringify(payload) });
      return true;
    }
    await updateJob(env.DB, job.id, { step: 'pdf', payload: JSON.stringify(payload) });
    job = { ...job, step: 'pdf' };
  }

  if (job.step === 'pdf') {
    if (seller) {
      await dropDocuments(env, job.order_id);
      await render(env, job, people, payload);
      // The seller delivers the reading themselves: no letter, no bot.
      await updateJob(env.DB, job.id, { step: 'done', status: 'done' });
      return true;
    }
    await render(env, job, people, payload);
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
  if (!contact) throw new Error(`no order for job ${job.id}`);
  const token = await signToken({ order: job.order_id, job: job.id }, env.LINK_KEY, LINK_TTL_SECONDS);
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
      console.error('telegram delivery', error instanceof Error ? error.message : String(error));
    }
  }
}
