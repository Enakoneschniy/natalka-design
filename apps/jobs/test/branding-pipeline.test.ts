import { describe, expect, it } from 'vitest';
import { saveBrand } from '../src/pro/brand';
import { assemblePdf, regenerateSection } from '../src/pro/lifecycle';
import { armFailure, lastRequest, runJob, testEnv } from './env';
import { readingFor, seedOrder } from './seed';

const BRAND = { name: 'Мария', contacts: ['@maria'], accent: '#8E7CC3', intro: '', outro: '', signature: '' };

describe('seller readings', () => {
  it('are written in the form of address the reading was ordered in', async () => {
    const r = await readingFor('Тыкает');
    await testEnv.DB.prepare("UPDATE pro_readings SET address = 'ty' WHERE order_id = ?").bind(r.id).run();
    await runJob(r.jobId);
    expect((await lastRequest('/v1/section|Тыкает'))?.address).toBe('ty');
    expect((await lastRequest('/v1/sections|last'))?.address).toBe('ty');

    await testEnv.DB.prepare("UPDATE pro_accounts SET tone = 'vy' WHERE id = ?").bind(r.account.id).run();
    await regenerateSection(testEnv, r.account.id, r.id, 'a');
    expect((await lastRequest('/v1/section|Тыкает'))?.address).toBe('ty');
  });

  it('are assembled with the seller brand, and never without one', async () => {
    const r = await readingFor('Бренд');
    await runJob(r.jobId);
    expect(await assemblePdf(testEnv, r.account.id, r.id)).toBe('no_brand');
    await saveBrand(testEnv, r.account.id, BRAND);
    expect(await assemblePdf(testEnv, r.account.id, r.id)).toBe('queued');
    await runJob(r.jobId);
    const skeleton = await lastRequest('/v1/skeleton|Бренд');
    expect(skeleton?.brand).toMatchObject({ name: 'Мария', accent: '#8E7CC3' });
  });

  it('are never stored under our branding when the API drops the brand', async () => {
    const r = await readingFor('Старый образ');
    await runJob(r.jobId);
    await saveBrand(testEnv, r.account.id, BRAND);
    expect(await assemblePdf(testEnv, r.account.id, r.id)).toBe('queued');
    await armFailure('Старый образ|nobrand', 1);
    await expect(runJob(r.jobId)).rejects.toThrow(/brand/);
    const rows = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?')
      .bind(r.id)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("leave a shopper's requests exactly as they were", async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Покупатель Б' });
    await runJob(jobId);
    expect(await lastRequest('/v1/section|Покупатель Б')).not.toHaveProperty('address');
    const skeleton = await lastRequest('/v1/skeleton|Покупатель Б');
    expect(skeleton).not.toHaveProperty('brand');
    expect(skeleton).not.toHaveProperty('address');
  });
});
