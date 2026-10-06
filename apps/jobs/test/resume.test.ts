import { createExecutionContext, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { signLink } from '../src/crypto';
import worker from '../src/index';
import { completeCheckout, envWith, lastRequest, testEnv } from './env';

const SITE = { 'x-site-key': 'test-site-key', 'content-type': 'application/json' };
const BIRTH = {
  date: '1985-11-02',
  time: null,
  latitude: 55.75,
  longitude: 37.62,
  zone: 'Europe/Moscow',
  place: 'Москва',
  name: 'Вера',
  gender: 'f',
};

interface Created {
  order_id: string;
  job_id: string;
  token: string;
  checkout_url: string;
}

/** An order whose payment page was opened and left. */
async function unpaidOrder(email = 'resume@orders.test'): Promise<Created & { session: string }> {
  const response = await SELF.fetch('https://jobs.test/v1/orders', {
    method: 'POST',
    headers: SITE,
    body: JSON.stringify({ email, product: 'forecast', locale: 'ru', amount_minor: 2900, currency: 'EUR', birth: BIRTH }),
  });
  const created = (await response.json()) as Created;
  return { ...created, session: created.checkout_url.split('/').pop() as string };
}

const resume = (token: string) =>
  SELF.fetch(`https://jobs.test/v1/jobs/${token}/checkout`, { method: 'POST', headers: SITE });

const sessionOf = async (orderId: string) =>
  (await testEnv.DB.prepare('SELECT stripe_session_id FROM orders WHERE id = ?').bind(orderId).first<{ stripe_session_id: string }>())
    ?.stripe_session_id;

describe('POST /v1/jobs/{token}/checkout', () => {
  it('closes the abandoned payment page and opens a new one for the same order', async () => {
    const order = await unpaidOrder();
    const response = await resume(order.token);
    expect(response.status).toBe(200);
    const { checkout_url } = (await response.json()) as { checkout_url: string };
    expect(checkout_url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_test_/);
    expect(checkout_url).not.toBe(order.checkout_url);

    expect(await lastRequest(`stripe|expired|${order.session}`)).toBe(true);
    expect(await sessionOf(order.order_id)).toBe(checkout_url.split('/').pop());
    const { fields, headers } = (await lastRequest(`stripe|checkout|${order.order_id}`)) as {
      fields: Record<string, string>;
      headers: Record<string, string>;
    };
    expect(fields).toMatchObject({
      'line_items[0][price_data][unit_amount]': '2900',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': 'Прогноз на 12 месяцев',
      customer_email: 'resume@orders.test',
      'metadata[order_id]': order.order_id,
      'metadata[job_id]': order.job_id,
      success_url: `https://chronika.test/ru/generating?t=${order.token}`,
      cancel_url: `https://chronika.test/ru/generating?t=${order.token}`,
    });
    expect(headers['idempotency-key']).toBe(`resume-${order.order_id}-${order.session}`);
  });

  it('opens one page for two taps at once', async () => {
    const order = await unpaidOrder();
    const [a, b] = await Promise.all([resume(order.token), resume(order.token)]);
    const urls = [((await a.json()) as { checkout_url: string }).checkout_url, ((await b.json()) as { checkout_url: string }).checkout_url];
    expect(urls[0]).toBe(urls[1]);
  });

  it('opens nothing when the previous page was paid a moment ago', async () => {
    const order = await unpaidOrder();
    await completeCheckout(order.session);
    const response = await resume(order.token);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'paid' });
    expect(await sessionOf(order.order_id)).toBe(order.session);
  });

  it('refuses an order that is paid, free, refunded, disputed or held', async () => {
    const cases: [string, string | null, string][] = [
      ['paid', null, 'paid'],
      ['test', null, 'paid'],
      ['refunded', null, 'closed'],
      ['paid', 'disputed', 'closed'],
      ['pending', 'amount_mismatch', 'closed'],
    ];
    for (const [status, hold, error] of cases) {
      const order = await unpaidOrder();
      await testEnv.DB.prepare('UPDATE orders SET status = ?, hold = ? WHERE id = ?').bind(status, hold, order.order_id).run();
      const response = await resume(order.token);
      expect(response.status, `${status}/${hold}`).toBe(409);
      expect(await response.json()).toEqual({ error });
    }
  });

  it('answers 404 for a bad token or a link of another kind', async () => {
    expect((await resume('a.b.c')).status).toBe(404);
    const sub = await signLink('sub', { sub: crypto.randomUUID() }, testEnv.LINK_KEY, 60);
    expect((await resume(sub)).status).toBe(404);
    const missing = await signLink('order', { order: crypto.randomUUID(), job: crypto.randomUUID() }, testEnv.LINK_KEY, 60);
    expect((await resume(missing)).status).toBe(404);
  });

  it('answers 503 without Stripe', async () => {
    const order = await unpaidOrder();
    const response = await worker.fetch(
      new Request(`https://jobs.test/v1/jobs/${order.token}/checkout`, { method: 'POST', headers: SITE }),
      envWith('STRIPE_SECRET_KEY', undefined),
      createExecutionContext(),
    );
    expect(response.status).toBe(503);
  });

  it('serves the status only to GET', async () => {
    const order = await unpaidOrder();
    expect((await SELF.fetch(`https://jobs.test/v1/jobs/${order.token}`, { method: 'DELETE', headers: SITE })).status).toBe(404);
    expect((await SELF.fetch(`https://jobs.test/v1/jobs/${order.token}`, { headers: SITE })).status).toBe(200);
  });
});
