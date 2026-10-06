import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBrand } from '../src/pro/brand';
import { assemblePdf, regenerateSection } from '../src/pro/lifecycle';
import { createReading } from '../src/pro/readings';
import { handlePro } from '../src/pro/routes';
import { envWith, runJob, signIn, testEnv } from './env';
import { readingFor } from './seed';

/** What the cabinet's code writes to the error log, joined, with the log kept out of the output. */
function errorLog(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return lines;
}

afterEach(() => vi.restoreAllMocks());

/** A queue that refuses, with a message quoting what it was given. */
const refusingQueue = (quote: string) => ({
  send: async () => Promise.reject(new Error(`queue refused a message for ${quote}`)),
});

describe("the cabinet's error log", () => {
  it('names a failed rewrite by its ids and the kind of error, never by what the error says', async () => {
    const { account, id, jobId } = await readingFor('Скрытая');
    await runJob(jobId);
    const errors = errorLog();
    const env = envWith('API', {
      fetch: async () => Promise.reject(new Error('model down while writing for Скрытая, 1994-05-15')),
    });
    expect(await regenerateSection(env, account.id, id, 'a')).toEqual({ status: 'failed' });
    const log = errors.join('\n');
    expect(log).toContain(id);
    expect(log).toContain('internal Error');
    expect(log).not.toContain('Скрытая');
    expect(log).not.toContain('1994-05-15');
  });

  it('logs a reading or a PDF that could not be queued without what the queue said', async () => {
    const { account, clientId, id, jobId } = await readingFor('Очередь');
    const errors = errorLog();
    const env = envWith('JOBS', refusingQueue(account.email));
    await expect(createReading(env, account, { product: 'natal', client_id: clientId })).rejects.toThrow();

    await runJob(jobId);
    await saveBrand(testEnv, account.id, { name: 'Бренд', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' });
    await expect(assemblePdf(env, account.id, id)).rejects.toThrow();

    const log = errors.join('\n');
    expect(log).toContain('reading could not be queued');
    expect(log).toContain('PDF assembly could not be queued');
    expect(log).not.toContain(account.email);
  });

  it('logs a letter that could not be sent by its status, not by the address', async () => {
    const errors = errorLog();
    const email = 'fail-mail@logs.test';
    const request = new Request('https://jobs.test/v1/pro/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key' },
      body: JSON.stringify({ email, name: 'Почта', terms: true }),
    });
    const response = await handlePro(request, testEnv, new URL(request.url));
    expect(response?.status).toBe(202);
    const log = errors.join('\n');
    expect(log).toContain('resend → 422');
    expect(log).not.toContain(email);
  });

  it('logs a failed pack checkout by the purchase and the status', async () => {
    const { session } = await signIn('fail-checkout@logs.test');
    const errors = errorLog();
    const request = new Request('https://jobs.test/v1/pro/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key', authorization: `Bearer ${session}` },
      body: JSON.stringify({ pack: 'p10' }),
    });
    expect((await handlePro(request, testEnv, new URL(request.url)))?.status).toBe(502);
    const log = errors.join('\n');
    expect(log).toContain('stripe pack checkout → 500');
    expect(log).not.toContain('fail-checkout@logs.test');
    expect(log).not.toContain('card_declined_internal');
  });
});
