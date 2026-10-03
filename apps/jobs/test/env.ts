import { env } from 'cloudflare:workers';
import type { Env } from '../src/env';

/** The worker's bindings as the tests see them. */
export const testEnv = env as unknown as Env;
