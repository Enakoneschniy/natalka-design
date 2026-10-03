import { env } from 'cloudflare:workers';
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
