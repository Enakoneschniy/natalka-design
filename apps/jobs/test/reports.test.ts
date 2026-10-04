import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { parseClientBirth } from '../src/pro/clients';
import { issueSession } from '../src/pro/auth';
import { deleteClient } from '../src/pro/readings';
import { runJob, testEnv } from './env';
import { ANNA } from './people';
import { readingFor } from './seed';

const report = (session: string, id: string, section: string, body: unknown) =>
  SELF.fetch(`https://jobs.test/v1/pro/readings/${id}/sections/${section}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key', authorization: `Bearer ${session}` },
    body: JSON.stringify(body),
  });

const written = async (name: string) => {
  const r = await readingFor(name);
  await runJob(r.jobId);
  return { ...r, session: await issueSession(testEnv, r.account) };
};

const count = async (accountId: string) =>
  (await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pro_reports WHERE account_id = ?').bind(accountId).first<{ n: number }>())!.n;

describe('report a problem', () => {
  it('stores the report', async () => {
    const r = await written('Rep1');
    const res = await report(r.session, r.id, 'a', { comment: '  wrong sign  ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const row = await testEnv.DB.prepare('SELECT * FROM pro_reports WHERE order_id = ?')
      .bind(r.id)
      .first<{ section_id: string; comment: string; account_id: string }>();
    expect(row).toMatchObject({ section_id: 'a', comment: 'wrong sign', account_id: r.account.id });
  });

  it('404s another seller reading and an unknown section', async () => {
    const mine = await written('Rep2');
    const other = await written('Rep3');
    expect((await report(other.session, mine.id, 'a', { comment: 'x' })).status).toBe(404);
    expect((await report(mine.session, mine.id, 'zzz', { comment: 'x' })).status).toBe(404);
    expect(await count(mine.account.id)).toBe(0);
  });

  it('400s an empty or too long comment', async () => {
    const r = await written('Rep4');
    for (const comment of ['   ', '', 'x'.repeat(1001), 5]) {
      const res = await report(r.session, r.id, 'a', { comment });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'comment' });
    }
    expect((await report(r.session, r.id, 'a', { comment: 'x'.repeat(1000) })).status).toBe(201);
  });

  it('429s the 21st report in an hour', async () => {
    const r = await written('Rep5');
    for (let i = 0; i < 20; i++) expect((await report(r.session, r.id, 'a', { comment: `n${i}` })).status).toBe(201);
    const res = await report(r.session, r.id, 'a', { comment: 'one more' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too many' });
  });

  it('does not count reports older than an hour', async () => {
    const r = await written('Rep6');
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    for (let i = 0; i < 20; i++) {
      await testEnv.DB.prepare('INSERT INTO pro_reports VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), r.account.id, r.id, 'a', 'old', old)
        .run();
    }
    expect((await report(r.session, r.id, 'a', { comment: 'fresh' })).status).toBe(201);
  });

  it('is removed with the client and its reading', async () => {
    const r = await written('Rep7');
    await report(r.session, r.id, 'b', { comment: 'bad' });
    expect(await count(r.account.id)).toBe(1);
    expect(await deleteClient(testEnv, r.account.id, r.clientId)).toBe(true);
    expect(await count(r.account.id)).toBe(0);
  });
});

describe('parseClientBirth date range', () => {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  it('rejects before 1900 and the future, accepts the edges', () => {
    expect(parseClientBirth({ ...ANNA, date: '1899-12-31' })).toBeNull();
    expect(parseClientBirth({ ...ANNA, date: day(1) })).toBeNull();
    expect(parseClientBirth({ ...ANNA, date: '1900-01-01' })?.date).toBe('1900-01-01');
    expect(parseClientBirth({ ...ANNA, date: day(0) })?.date).toBe(day(0));
  });
});
