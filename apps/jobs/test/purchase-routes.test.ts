import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { PENDING_PURCHASES_PER_HOUR } from '../src/pro/purchases';
import { handlePro } from '../src/pro/routes';
import { lastRequest, testEnv, tokenFor } from './env';

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

async function seller(name: string): Promise<{ session: string; email: string }> {
  const email = `${name}@purchase-routes.test`;
  const token = await tokenFor(email);
  const response = await SELF.fetch('https://jobs.test/v1/pro/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key' },
    body: JSON.stringify({ token }),
  });
  const { session } = (await response.json()) as { session: string };
  return { session, email };
}

describe('POST /v1/pro/purchases', () => {
  it('opens a Stripe Checkout for the pack and keeps the purchase pending', async () => {
    const { session, email } = await seller('buyer');
    const response = await call('POST', '/v1/pro/purchases', session, { pack: 'p30' });
    expect(response.status).toBe(201);
    const { id, checkout_url } = (await response.json()) as { id: string; checkout_url: string };
    expect(checkout_url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_test_/);

    const row = await testEnv.DB.prepare('SELECT status, stripe_session_id FROM pro_purchases WHERE id = ?')
      .bind(id)
      .first<{ status: string; stripe_session_id: string }>();
    expect(row?.status).toBe('pending');
    expect(checkout_url.endsWith(row!.stripe_session_id)).toBe(true);

    const recorded = (await lastRequest(`stripe|checkout|${id}`)) as {
      fields: Record<string, string>;
      headers: Record<string, string>;
    };
    const sent = recorded.fields;
    expect(recorded.headers['idempotency-key']).toBe(`pack-${id}`);
    expect(sent['metadata[pack]']).toBe('p30');
    expect(sent['metadata[account_id]']).toBe(
      (await testEnv.DB.prepare('SELECT id FROM pro_accounts WHERE email = ?').bind(email).first<{ id: string }>())!.id,
    );
    expect(sent['line_items[0][price_data][unit_amount]']).toBe('24900');
    expect(sent['line_items[0][price_data][currency]']).toBe('eur');
    expect(sent['metadata[kind]']).toBe('pro_pack');
    expect(sent['metadata[purchase_id]']).toBe(id);
    expect(sent['tax_id_collection[enabled]']).toBe('true');
    expect(sent['payment_intent_data[description]']).toBe('Chronika Pro · 30 кредитов');
    expect(sent.customer_email).toBe(email);
    expect(sent.success_url).toBe(`https://pro.chronika.test/credits?purchase=${id}`);
    expect(sent.cancel_url).toBe('https://pro.chronika.test/credits');
  });

  it('marks the purchase failed and hides the Stripe error when Checkout fails', async () => {
    const { session, email } = await seller('fail-checkout');
    const response = await call('POST', '/v1/pro/purchases', session, { pack: 'p10' });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: 'checkout' });
    expect(text).not.toContain('stripe-secret-detail');
    const row = await testEnv.DB.prepare(
      'SELECT p.status FROM pro_purchases p JOIN pro_accounts a ON a.id = p.account_id WHERE a.email = ?',
    )
      .bind(email)
      .first<{ status: string }>();
    expect(row?.status).toBe('failed');
  });

  it('refuses an unknown pack', async () => {
    const { session } = await seller('badpack');
    const response = await call('POST', '/v1/pro/purchases', session, { pack: 'p999' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'pack' });
  });

  it('answers 503 when Stripe is not configured, and creates nothing', async () => {
    const { session } = await seller('nokey');
    // defineProperty, not Object.assign: assigning through the prototype would reach the shared
    // bindings object and unset the key for every later test.
    const env = Object.create(testEnv);
    Object.defineProperty(env, 'STRIPE_SECRET_KEY', { value: undefined });
    const request = new Request('https://jobs.test/v1/pro/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key', authorization: `Bearer ${session}` },
      body: JSON.stringify({ pack: 'p10' }),
    });
    const response = await handlePro(request, env, new URL(request.url));
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: 'payments unavailable' });
    const count = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS n FROM pro_purchases p JOIN pro_accounts a ON a.id = p.account_id WHERE a.email = ?',
    )
      .bind('nokey@purchase-routes.test')
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});

describe('GET /v1/pro/purchases', () => {
  it("lists the seller's own purchases only", async () => {
    const mine = await seller('lister');
    const other = await seller('stranger');
    const created = await call('POST', '/v1/pro/purchases', mine.session, { pack: 'p10' });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const list = (await (await call('GET', '/v1/pro/purchases', mine.session)).json()) as {
      purchases: { id: string; status: string; pack: string }[];
    };
    expect(list.purchases.map((p) => [p.id, p.status, p.pack])).toEqual([[id, 'pending', 'p10']]);

    const theirs = (await (await call('GET', '/v1/pro/purchases', other.session)).json()) as { purchases: unknown[] };
    expect(theirs.purchases).toEqual([]);
  });
});

describe('unpaid checkouts', () => {
  const purchases = async (email: string) =>
    (
      await testEnv.DB.prepare(
        'SELECT p.id, p.status FROM pro_purchases p JOIN pro_accounts a ON a.id = p.account_id WHERE a.email = ? ORDER BY p.rowid',
      )
        .bind(email)
        .all<{ id: string; status: string }>()
    ).results;

  it('open no fourth while three from the last hour are unpaid, and answer 429', async () => {
    const { session, email } = await seller('impatient');
    for (let i = 0; i < PENDING_PURCHASES_PER_HOUR; i++) {
      expect((await call('POST', '/v1/pro/purchases', session, { pack: 'p10' })).status).toBe(201);
    }
    const refused = await call('POST', '/v1/pro/purchases', session, { pack: 'p30' });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too_many' });
    expect(await purchases(email)).toHaveLength(PENDING_PURCHASES_PER_HOUR);
  });

  it('count only purchases still pending from the last hour', async () => {
    const { session, email } = await seller('settling');
    for (let i = 0; i < PENDING_PURCHASES_PER_HOUR; i++) await call('POST', '/v1/pro/purchases', session, { pack: 'p10' });
    const [paid, failed, old] = await purchases(email);
    await testEnv.DB.prepare("UPDATE pro_purchases SET status = 'paid' WHERE id = ?").bind(paid?.id).run();
    await testEnv.DB.prepare("UPDATE pro_purchases SET status = 'failed' WHERE id = ?").bind(failed?.id).run();
    await testEnv.DB.prepare('UPDATE pro_purchases SET created_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 61 * 60 * 1000).toISOString(), old?.id)
      .run();
    for (let i = 0; i < PENDING_PURCHASES_PER_HOUR; i++) {
      expect((await call('POST', '/v1/pro/purchases', session, { pack: 'p10' })).status).toBe(201);
    }
    expect((await call('POST', '/v1/pro/purchases', session, { pack: 'p10' })).status).toBe(429);
  });

  it('hold the limit when they are asked for at once', async () => {
    const { session, email } = await seller('hasty');
    const statuses = (
      await Promise.all(Array.from({ length: 8 }, () => call('POST', '/v1/pro/purchases', session, { pack: 'p10' })))
    ).map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(PENDING_PURCHASES_PER_HOUR);
    expect(statuses.filter((status) => status === 429)).toHaveLength(8 - PENDING_PURCHASES_PER_HOUR);
    expect(await purchases(email)).toHaveLength(PENDING_PURCHASES_PER_HOUR);
  });
});
