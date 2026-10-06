import { createExecutionContext, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { envWith } from './env';

const SITE = { 'x-site-key': 'test-site-key' };

describe('the site key', () => {
  it('leaves /health open', async () => {
    const response = await SELF.fetch('https://jobs.test/health');
    expect(response.status).toBe(200);
  });

  it('answers 401 on every site route without the key, before doing any work', async () => {
    const calls: [string, string][] = [
      ['POST', '/v1/orders'],
      ['POST', '/v1/preview'],
      ['POST', '/v1/subscriptions'],
      ['GET', '/v1/subscriptions/some.token.here'],
      ['GET', '/v1/jobs/some.token.here'],
      ['POST', '/v1/jobs/some.token.here/telegram'],
      ['GET', '/d/some.token.here'],
      ['GET', '/nowhere'],
      ['POST', '/health'],
    ];
    for (const [method, path] of calls) {
      const response = await SELF.fetch(`https://jobs.test${path}`, { method, body: method === 'GET' ? undefined : '{}' });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('answers 401 to a wrong key, whatever its length', async () => {
    for (const key of ['test-site-ke', 'test-site-key-', 'TEST-SITE-KEY', 'x']) {
      const response = await SELF.fetch('https://jobs.test/v1/jobs/a.b.c', { headers: { 'x-site-key': key } });
      expect(response.status, key).toBe(401);
    }
  });

  it('lets the right key through to the routes', async () => {
    const response = await SELF.fetch('https://jobs.test/nowhere', { headers: SITE });
    expect(response.status).toBe(404);
  });

  it('does not stand in front of the Stripe webhook, which checks its own signature', async () => {
    const response = await SELF.fetch('https://jobs.test/v1/stripe/webhook', { method: 'POST', body: '{}' });
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('bad signature');
  });

  it('leaves the seller routes to their own key', async () => {
    const response = await SELF.fetch('https://jobs.test/v1/pro/me', { headers: { 'x-pro-key': 'test-pro-key' } });
    expect(response.status).toBe(401);
    const site = await SELF.fetch('https://jobs.test/v1/pro/me', { headers: SITE });
    expect(site.status).toBe(401);
  });

  it('serves nothing but health and the webhook when the key is not configured', async () => {
    const env = envWith('SITE_KEY', undefined);
    const call = (method: string, path: string) =>
      worker.fetch(new Request(`https://jobs.test${path}`, { method, headers: SITE }), env, createExecutionContext());
    expect((await call('GET', '/health')).status).toBe(200);
    const refused = await call('GET', '/v1/jobs/a.b.c');
    expect(refused.status).toBe(503);
    expect((await call('POST', '/v1/orders')).status).toBe(503);
  });
});
