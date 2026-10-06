import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { advance } from '../src/pipeline';
import { lastRequest, runJob, testEnv } from './env';
import { seedOrder } from './seed';

const BIRTH = { date: '1990-01-01', time: '12:00', latitude: 1, longitude: 2, zone: 'UTC', place: 'Город', gender: 'f' };

describe('rendering', () => {
  it('puts at most 80 characters of the two names on a synastry cover', async () => {
    const first = 'А'.repeat(60);
    const second = 'Б'.repeat(60);
    const response = await SELF.fetch('https://jobs.test/v1/orders', {
      method: 'POST',
      headers: { 'x-site-key': 'test-site-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'pair@render.test',
        product: 'synastry',
        locale: 'ru',
        amount_minor: 1900,
        currency: 'EUR',
        birth: { ...BIRTH, name: first },
        birth_second: { ...BIRTH, name: second },
      }),
    });
    const { job_id } = (await response.json()) as { job_id: string };
    expect(await runJob(job_id)).toBe(true);
    const cover = `${first} и ${'Б'.repeat(17)}`;
    expect([...cover]).toHaveLength(80);
    expect(await lastRequest(`/v1/skeleton|${cover}`)).toMatchObject({ name: cover, product: 'synastry' });
  });

  it('takes the PDF out of storage again when its row cannot be written', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Без строки' });
    const failing = new Proxy(testEnv.DB, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'prepare') {
          return (sql: string) => {
            if (sql.includes('INSERT INTO documents')) throw new Error('database is locked');
            return (value as D1Database['prepare']).call(target, sql);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const job = await getJob(testEnv.DB, jobId);
    await expect(advance({ ...testEnv, DB: failing }, job!, Date.now() + 60_000)).rejects.toThrow('database is locked');
    expect(await testEnv.DOCS.get(`${orderId}/natal-ru.pdf`)).toBeNull();
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('pdf');

    expect(await runJob(jobId)).toBe(true);
    expect(await testEnv.DOCS.get(`${orderId}/natal-ru.pdf`)).not.toBeNull();
  });
});
