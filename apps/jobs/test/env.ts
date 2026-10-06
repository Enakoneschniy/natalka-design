import { env } from 'cloudflare:workers';
import { getJob, updateJob } from '../src/db';
import { advance, type JobPayload, openPayload, sealPayload } from '../src/pipeline';
import type { Env } from '../src/env';
import {
  accountExists,
  consumeLoginToken,
  createLoginToken,
  createSignupToken,
  issueSession,
  type ProAccount,
} from '../src/pro/auth';

/** The worker's bindings as the tests see them. */
export const testEnv = env as unknown as Env;

/** A token that signs `email` in: a login token for a registered address, a sign-up token (which
 * creates the account) for a new one. */
export async function tokenFor(email: string): Promise<string | null> {
  return (await accountExists(testEnv.DB, email))
    ? createLoginToken(testEnv.DB, email)
    : createSignupToken(testEnv.DB, email, { name: 'Test' });
}

/** A signed-in seller with a fresh session, for tests that need one. */
export async function signIn(email: string): Promise<{ account: ProAccount; session: string }> {
  const raw = await tokenFor(email);
  if (!raw) throw new Error('throttled');
  const account = await consumeLoginToken(testEnv.DB, raw);
  if (!account) throw new Error('sign-in failed');
  return { account, session: await issueSession(testEnv, account) };
}

/** Makes the fake text API fail the next `times` calls matching `key` (see test/fakes.ts). */
export async function armFailure(key: string, times = 1000): Promise<void> {
  await testEnv.API.fetch('https://api.test/__fail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, times }),
  });
}

/** A job's payload, decrypted the way the worker reads it. */
export async function payloadOf(jobId: string): Promise<JobPayload> {
  const job = await getJob(testEnv.DB, jobId);
  if (!job) throw new Error(`no job ${jobId}`);
  return openPayload(testEnv, job);
}

/** Stores a payload the way the worker writes it. */
export async function writePayload(jobId: string, payload: JobPayload): Promise<void> {
  await updateJob(testEnv.DB, jobId, await sealPayload(testEnv, payload));
}

/** One pipeline pass over a job, with a generous budget. */
export async function runJob(jobId: string): Promise<boolean> {
  const job = await getJob(testEnv.DB, jobId);
  if (!job) throw new Error(`no job ${jobId}`);
  return advance(testEnv, job, Date.now() + 60_000);
}

/** The last request the fake text API saw under `key` ("<path>|<name>"), or null. */
export async function lastRequest(key: string): Promise<Record<string, unknown> | null> {
  const response = await testEnv.API.fetch(`https://api.test/__last?key=${encodeURIComponent(key)}`);
  return (await response.json()) as Record<string, unknown> | null;
}

export interface Letter {
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Marks a Checkout Session of the fake Stripe as paid on Stripe's side. */
export async function completeCheckout(sessionId: string): Promise<void> {
  await testEnv.API.fetch('https://api.test/__stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ complete: sessionId }),
  });
}

/** Every letter the fake Resend took for `to`, oldest first. */
export async function letters(to: string): Promise<Letter[]> {
  return ((await lastRequest(`mail|${to}`)) as Letter[] | null) ?? [];
}

/** The worker's bindings with one of them replaced. defineProperty, not assignment: assigning
 * through the prototype would reach the shared bindings and change them for every later test. */
export function envWith(name: string, value: unknown): Env {
  const env = Object.create(testEnv);
  Object.defineProperty(env, name, { value });
  return env;
}
