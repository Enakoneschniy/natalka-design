import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createLoginToken } from '../src/pro/auth';
import { grant } from '../src/pro/credits';
import { handlePro } from '../src/pro/routes';
import { ANNA } from './people';
import { runJob, testEnv } from './env';

const call = (method: string, path: string, session: string, body?: unknown) =>
  SELF.fetch(`https://jobs.test${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-pro-key': 'test-pro-key',
      authorization: `Bearer ${session}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function sellerSession(name: string, credits = 3): Promise<{ session: string; accountId: string }> {
  const token = await createLoginToken(testEnv.DB, `${name}@routes2.test`);
  const response = await SELF.fetch('https://jobs.test/v1/pro/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key' },
    body: JSON.stringify({ token }),
  });
  const { session } = (await response.json()) as { session: string };
  const account = await testEnv.DB.prepare('SELECT id FROM pro_accounts WHERE email = ?')
    .bind(`${name}@routes2.test`)
    .first<{ id: string }>();
  if (credits) await grant(testEnv.DB, { accountId: account!.id, delta: credits, reason: 'adjust', ref: null });
  return { session, accountId: account!.id };
}

const jobOf = async (orderId: string) =>
  (await testEnv.DB.prepare('SELECT job_id FROM pro_readings WHERE order_id = ?').bind(orderId).first<{ job_id: string }>())
    ?.job_id as string;

describe('clients and readings over HTTP', () => {
  it('runs a reading from a new client to a PDF', async () => {
    const { session } = await sellerSession('flow');
    const created = await call('POST', '/v1/pro/clients', session, { ...ANNA, consent: true });
    expect(created.status).toBe(201);
    const { id: clientId } = (await created.json()) as { id: string };

    const ordered = await call('POST', '/v1/pro/readings', session, { product: 'natal', client_id: clientId });
    expect(ordered.status).toBe(201);
    const { id } = (await ordered.json()) as { id: string };
    expect(((await (await call('GET', `/v1/pro/readings/${id}`, session)).json()) as { status: string }).status).toBe(
      'writing',
    );

    await runJob(await jobOf(id));
    const ready = (await (await call('GET', `/v1/pro/readings/${id}`, session)).json()) as { status: string };
    expect(ready.status).toBe('ready');

    const rewrite = await call('POST', `/v1/pro/readings/${id}/sections/a/regenerate`, session);
    expect(rewrite.status).toBe(200);
    expect(((await rewrite.json()) as { regenerations_left: number }).regenerations_left).toBe(9);

    const noBrand = await call('POST', `/v1/pro/readings/${id}/pdf`, session);
    expect(noBrand.status).toBe(409);
    expect(await noBrand.json()).toEqual({ error: 'no_brand' });
    expect(
      (await call('PUT', '/v1/pro/brand', session, { name: 'Тест', contacts: [], accent: '#E7B75C' })).status,
    ).toBe(200);
    expect((await call('POST', `/v1/pro/readings/${id}/pdf`, session)).status).toBe(202);
    expect((await call('POST', `/v1/pro/readings/${id}/pdf`, session)).status).toBe(409);
    await runJob(await jobOf(id));
    const pdf = await call('GET', `/v1/pro/readings/${id}/pdf`, session);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toContain('.pdf');

    const client = (await (await call('GET', `/v1/pro/clients/${clientId}`, session)).json()) as {
      readings: { id: string }[];
    };
    expect(client.readings.map((r) => r.id)).toEqual([id]);
  });

  it('needs consent and a valid birth', async () => {
    const { session } = await sellerSession('consent');
    expect((await call('POST', '/v1/pro/clients', session, { ...ANNA })).status).toBe(400);
    expect((await call('POST', '/v1/pro/clients', session, { ...ANNA, consent: 'yes' })).status).toBe(400);
    const bad = await call('POST', '/v1/pro/clients', session, { ...ANNA, date: 'вчера', consent: true });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'birth' });
  });

  it('answers 402 without credits', async () => {
    const { session } = await sellerSession('broke', 0);
    const { id } = (await (await call('POST', '/v1/pro/clients', session, { ...ANNA, consent: true })).json()) as {
      id: string;
    };
    const response = await call('POST', '/v1/pro/readings', session, { product: 'natal', client_id: id });
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: 'insufficient credits', balance: 0 });
  });

  it("answers 404 for another seller's client and reading", async () => {
    const owner = await sellerSession('owner');
    const stranger = await sellerSession('stranger');
    const { id: clientId } = (await (
      await call('POST', '/v1/pro/clients', owner.session, { ...ANNA, consent: true })
    ).json()) as { id: string };
    const { id } = (await (
      await call('POST', '/v1/pro/readings', owner.session, { product: 'natal', client_id: clientId })
    ).json()) as { id: string };
    for (const [method, path] of [
      ['GET', `/v1/pro/clients/${clientId}`],
      ['DELETE', `/v1/pro/clients/${clientId}`],
      ['GET', `/v1/pro/readings/${id}`],
      ['POST', `/v1/pro/readings/${id}/sections/a/regenerate`],
      ['POST', `/v1/pro/readings/${id}/pdf`],
      ['GET', `/v1/pro/readings/${id}/pdf`],
    ] as const) {
      expect((await call(method, path, stranger.session)).status).toBe(404);
    }
    expect((await call('GET', `/v1/pro/clients/${clientId}`, owner.session)).status).toBe(200);
  });

  it('deletes a client and their readings', async () => {
    const { session } = await sellerSession('delete');
    const { id: clientId } = (await (
      await call('POST', '/v1/pro/clients', session, { ...ANNA, consent: true })
    ).json()) as { id: string };
    const { id } = (await (
      await call('POST', '/v1/pro/readings', session, { product: 'natal', client_id: clientId })
    ).json()) as { id: string };
    expect((await call('DELETE', `/v1/pro/clients/${clientId}`, session)).status).toBe(200);
    expect((await call('GET', `/v1/pro/readings/${id}`, session)).status).toBe(404);
    expect(((await (await call('GET', '/v1/pro/clients', session)).json()) as { clients: unknown[] }).clients).toEqual([]);
  });

  it('shows the demo reading to any seller, and 404 without one', async () => {
    const owner = await sellerSession('demo-owner');
    const { id: clientId } = (await (
      await call('POST', '/v1/pro/clients', owner.session, { ...ANNA, consent: true })
    ).json()) as { id: string };
    const { id } = (await (
      await call('POST', '/v1/pro/readings', owner.session, { product: 'natal', client_id: clientId })
    ).json()) as { id: string };
    await runJob(await jobOf(id));
    const visitor = await sellerSession('demo-visitor', 0);
    const request = () =>
      new Request('https://jobs.test/v1/pro/demo', {
        headers: { 'x-pro-key': 'test-pro-key', authorization: `Bearer ${visitor.session}` },
      });

    const without = await handlePro(request(), testEnv, new URL('https://jobs.test/v1/pro/demo'));
    expect(without?.status).toBe(404);
    const withDemo = await handlePro(request(), Object.assign(Object.create(testEnv), { PRO_DEMO_ORDER_ID: id }), new URL('https://jobs.test/v1/pro/demo'));
    expect(withDemo?.status).toBe(200);
    const demo = (await withDemo?.json()) as { product: string; sections: { id: string }[] };
    expect(demo.product).toBe('natal');
    expect(demo.sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(demo)).not.toContain(clientId);
  });
});
