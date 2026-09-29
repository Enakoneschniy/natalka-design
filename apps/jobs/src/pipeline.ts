/** Turning an order into a PDF: calculate, write, render, store.
 *
 * Every step writes its result into the job row before the next one starts, so a retry resumes
 * from where it stopped instead of paying the model twice for the same section.
 */

import { decryptJson } from './crypto';
import { sha256Hex } from './crypto';
import { expiryFrom, insertDocument, updateJob, type JobRow } from './db';
import type { Env } from './env';

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

interface SectionPlan {
  id: string;
  title: string;
  quote: boolean;
}

interface WrittenSection extends SectionPlan {
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

const api = async <T>(env: Env, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${env.NATALKA_API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`${path} → ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T;
};

export async function loadBirth(env: Env, orderId: string): Promise<BirthData> {
  const row = await env.DB.prepare(
    'SELECT birth_ciphertext, birth_nonce FROM charts WHERE order_id = ? AND person_no = 1',
  )
    .bind(orderId)
    .first<{ birth_ciphertext: ArrayBuffer; birth_nonce: ArrayBuffer }>();
  if (!row) throw new Error(`no chart for order ${orderId}`);
  return decryptJson<BirthData>(row.birth_ciphertext, row.birth_nonce, env.DATA_KEY);
}

async function calculate(env: Env, job: JobRow, birth: BirthData): Promise<JobPayload> {
  const facts = await api<Record<string, unknown> & { transits?: unknown[] }>(env, '/v1/calc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      date: birth.date,
      time: birth.time,
      latitude: birth.latitude,
      longitude: birth.longitude,
      zone: birth.zone,
      transit_years: 3,
    }),
  });
  const transits = facts.transits ?? [];
  delete facts.transits;

  const unknownTime = Boolean((facts.birth as { unknown_time?: boolean }).unknown_time);
  const plan = await api<{ sections: SectionPlan[] }>(
    env,
    `/v1/sections?product=${job.kind}&lang=${birth.lang}&unknown_time=${unknownTime}`,
  );
  return { facts, transits, plan: plan.sections, sections: [] };
}

/** Writes the sections that are still missing, oldest first, and stops when the budget runs out.
 *
 * The queue message is re-sent rather than held open for the whole document: a reading is fifteen
 * minutes of model calls and a Worker invocation is not allowed to run that long. Each pass writes
 * as many sections as it safely can and hands the rest to the next attempt. */
async function writeSections(
  env: Env,
  job: JobRow,
  birth: BirthData,
  payload: JobPayload,
  deadline: number,
): Promise<{ payload: JobPayload; done: boolean }> {
  const plan = payload.plan ?? [];
  const sections = payload.sections ?? [];
  const written = new Set(sections.map((s) => s.id));

  for (const entry of plan) {
    if (written.has(entry.id)) continue;
    if (Date.now() > deadline) return { payload: { ...payload, sections }, done: false };

    const section = await api<WrittenSection>(env, '/v1/section', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        facts: payload.facts,
        transits: payload.transits ?? [],
        section_id: entry.id,
        product: job.kind,
        lang: birth.lang,
        name: birth.name,
        gender: birth.gender,
        written_so_far: sections.map((s) => `${s.title}: ${s.text.slice(0, 160)}…`),
      }),
    });
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

async function render(env: Env, job: JobRow, birth: BirthData, payload: JobPayload): Promise<void> {
  const document = await api<Record<string, unknown>>(env, '/v1/skeleton', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      facts: payload.facts,
      transits: payload.transits ?? [],
      product: job.kind,
      lang: birth.lang,
      name: birth.name,
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

  const pdf = await fetch(`${env.NATALKA_API_URL}/v1/document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!pdf.ok) throw new Error(`/v1/document → ${pdf.status}`);
  const bytes = await pdf.arrayBuffer();

  const key = `${job.order_id}/${job.kind}-${birth.lang}.pdf`;
  await env.DOCS.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  await insertDocument(env.DB, {
    id: crypto.randomUUID(),
    order_id: job.order_id,
    storage_key: key,
    sha256: await sha256Hex(bytes),
    pages: Number((document.meta as { pages?: number } | undefined)?.pages ?? 0),
    bytes: bytes.byteLength,
    lang: birth.lang,
    expires_at: expiryFrom(Number(env.RETENTION_DAYS ?? '30')),
  });
}

/** One pass over a job. Returns true when the document is finished. */
export async function advance(env: Env, job: JobRow, deadline: number): Promise<boolean> {
  const birth = await loadBirth(env, job.order_id);
  let payload: JobPayload = job.payload ? (JSON.parse(job.payload) as JobPayload) : {};

  if (job.step === 'calc') {
    payload = await calculate(env, job, birth);
    await updateJob(env.DB, job.id, {
      step: 'texts',
      status: 'running',
      payload: JSON.stringify(payload),
    });
    job = { ...job, step: 'texts' };
  }

  if (job.step === 'texts') {
    const result = await writeSections(env, job, birth, payload, deadline);
    payload = result.payload;
    if (!result.done) {
      await updateJob(env.DB, job.id, { payload: JSON.stringify(payload) });
      return false;
    }
    await updateJob(env.DB, job.id, { step: 'pdf', payload: JSON.stringify(payload) });
    job = { ...job, step: 'pdf' };
  }

  if (job.step === 'pdf') {
    await render(env, job, birth, payload);
    await updateJob(env.DB, job.id, { step: 'done', status: 'done' });
  }
  return true;
}
