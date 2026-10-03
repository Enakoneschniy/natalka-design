import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { testEnv } from './env';

it('answers /health', async () => {
  const response = await SELF.fetch('https://jobs.test/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

it('has the schema applied', async () => {
  const row = await testEnv.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'",
  ).first<{ name: string }>();
  expect(row?.name).toBe('orders');
});
