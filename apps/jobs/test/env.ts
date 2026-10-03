import { env } from 'cloudflare:workers';
import { getJob } from '../src/db';
import { advance } from '../src/pipeline';
import type { Env } from '../src/env';
import { consumeLoginToken, createLoginToken, issueSession, type ProAccount } from '../src/pro/auth';

/** The worker's bindings as the tests see them. */
export const testEnv = env as unknown as Env;

/** A signed-in seller with a fresh session, for tests that need one. */
export async function signIn(email: string): Promise<{ account: ProAccount; session: string }> {
  const raw = await createLoginToken(testEnv.DB, email);
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

/** One pipeline pass over a job, with a generous budget. */
export async function runJob(jobId: string): Promise<boolean> {
  const job = await getJob(testEnv.DB, jobId);
  if (!job) throw new Error(`no job ${jobId}`);
  return advance(testEnv, job, Date.now() + 60_000);
}
