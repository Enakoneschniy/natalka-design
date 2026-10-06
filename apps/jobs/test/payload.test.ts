import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { signLink } from '../src/crypto';
import { getJob } from '../src/db';
import { openPayload, sealLegacyPayloads } from '../src/pipeline';
import { regenerateSection } from '../src/pro/lifecycle';
import { payloadOf, runJob, testEnv } from './env';
import { readingFor, seedOrder } from './seed';

const raw = (jobId: string) =>
  testEnv.DB.prepare('SELECT payload, payload_ct, payload_nonce FROM jobs WHERE id = ?')
    .bind(jobId)
    .first<{ payload: string | null; payload_ct: unknown; payload_nonce: unknown }>();

const LEGACY = { facts: { birth: { date: '1994-05-15' } }, transits: [], plan: [{ id: 'a', title: 'Первая', quote: false }], sections: [] };

describe("a job's payload", () => {
  it('is stored encrypted by every step that writes it', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Шифр' });
    expect(await runJob(jobId)).toBe(true);
    const row = await raw(jobId);
    expect(row?.payload).toBeNull();
    expect(row?.payload_ct).toBeTruthy();
    expect(row?.payload_nonce).toBeTruthy();
    expect((await payloadOf(jobId)).sections?.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it("is stored encrypted when a seller's section is rewritten", async () => {
    const { account, id, jobId } = await readingFor('Перепись');
    await runJob(jobId);
    expect((await regenerateSection(testEnv, account.id, id, 'b')).status).toBe('ok');
    expect((await raw(jobId))?.payload).toBeNull();
    expect((await payloadOf(jobId)).sections).toHaveLength(3);
  });

  it('is read from rows written in plain text before the encryption', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Старый формат' });
    await testEnv.DB.prepare("UPDATE jobs SET step = 'texts', payload = ? WHERE id = ?").bind(JSON.stringify(LEGACY), jobId).run();
    const token = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 60);
    const status = await SELF.fetch(`https://jobs.test/v1/jobs/${token}`, { headers: { 'x-site-key': 'test-site-key' } });
    expect(await status.json()).toMatchObject({ written: 0, total: 1 });
    // The pipeline resumes from it and writes the rest encrypted.
    expect(await runJob(jobId)).toBe(true);
    expect((await raw(jobId))?.payload).toBeNull();
  });

  it('is taken from the plain column when a worker from before wrote it after the ciphertext', async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Оба' });
    await runJob(jobId);
    await testEnv.DB.prepare('UPDATE jobs SET payload = ? WHERE id = ?').bind(JSON.stringify(LEGACY), jobId).run();
    const job = await getJob(testEnv.DB, jobId);
    expect((await openPayload(testEnv, job!)).plan?.map((p) => p.id)).toEqual(['a']);
  });

  it('left in plain text is encrypted by the sweep, a batch at a time', async () => {
    const jobs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { jobId } = await seedOrder({ pro: i === 0, name: `Пакет ${i}` });
      await testEnv.DB.prepare('UPDATE jobs SET payload = ? WHERE id = ?').bind(JSON.stringify({ ...LEGACY, n: i }), jobId).run();
      jobs.push(jobId);
    }
    expect(await sealLegacyPayloads(testEnv, 1)).toBe(1);
    while ((await sealLegacyPayloads(testEnv, 200)) > 0) {
      // until nothing plain is left
    }
    for (const [i, jobId] of jobs.entries()) {
      const row = await raw(jobId);
      expect(row?.payload).toBeNull();
      expect(row?.payload_ct).toBeTruthy();
      expect(await payloadOf(jobId)).toMatchObject({ ...LEGACY, n: i });
    }
  });
});

describe('charts', () => {
  const labels = (orderId: string) =>
    testEnv.DB.prepare('SELECT display_name, place_label FROM charts WHERE order_id = ?').bind(orderId).all();

  it("keep a shopper's name and place in the ciphertext only", async () => {
    const response = await SELF.fetch('https://jobs.test/v1/orders', {
      method: 'POST',
      headers: { 'x-site-key': 'test-site-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'labels@payload.test',
        product: 'synastry',
        locale: 'ru',
        amount_minor: 1900,
        currency: 'EUR',
        birth: { date: '1990-01-01', time: null, latitude: 1, longitude: 2, zone: 'UTC', place: 'Город', name: 'Анна', gender: 'f' },
        birth_second: { date: '1991-01-01', time: null, latitude: 1, longitude: 2, zone: 'UTC', place: 'Село', name: 'Иван', gender: 'm' },
      }),
    });
    const { order_id } = (await response.json()) as { order_id: string };
    expect((await labels(order_id)).results).toEqual([
      { display_name: null, place_label: null },
      { display_name: null, place_label: null },
    ]);
  });

  it("keep a seller's client's name and place in the ciphertext only", async () => {
    const { id } = await readingFor('Клиент без меток');
    expect((await labels(id)).results).toEqual([{ display_name: null, place_label: null }]);
  });
});
