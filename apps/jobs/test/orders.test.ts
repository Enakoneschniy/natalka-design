import { createExecutionContext, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { decryptJson, signLink } from '../src/crypto';
import worker from '../src/index';
import { envWith, lastRequest, runJob, testEnv } from './env';
import { seedOrder } from './seed';

const SITE = { 'x-site-key': 'test-site-key', 'content-type': 'application/json' };
const BIRTH = {
  date: '1990-05-17',
  time: '14:30',
  latitude: 50.45,
  longitude: 30.52,
  zone: 'Europe/Kyiv',
  place: 'Киев',
  name: 'Оксана',
  gender: 'f',
};
const ORDER = {
  email: 'Buyer@Orders.test ',
  product: 'natal',
  locale: 'ru',
  country: 'UA',
  amount_minor: 1900,
  currency: 'EUR',
  variant: 'a',
  consent: 'granted',
  source: 'meta',
  birth: BIRTH,
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch('https://jobs.test/v1/orders', {
    method: 'POST',
    headers: { ...SITE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** The order route on a worker with one binding replaced. */
const postWith = (env: unknown, body: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(
    new Request('https://jobs.test/v1/orders', { method: 'POST', headers: { ...SITE, ...headers }, body: JSON.stringify(body) }),
    env as typeof testEnv,
    createExecutionContext(),
  );

const orderRow = (id: string) =>
  testEnv.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<Record<string, unknown>>();

interface Created {
  order_id: string;
  job_id: string;
  token: string;
  checkout_url?: string;
}

describe('POST /v1/orders', () => {
  it('opens a payment page named and priced by the worker, with no birth data on it', async () => {
    const response = await post({
      ...ORDER,
      cancel_url: 'https://evil.test/back',
      product_name: 'Whatever the browser says',
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as Created;
    expect(created.checkout_url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_test_/);

    const { fields, headers } = (await lastRequest(`stripe|checkout|${created.order_id}`)) as {
      fields: Record<string, string>;
      headers: Record<string, string>;
    };
    const page = `https://chronika.test/ru/generating?t=${created.token}`;
    expect(fields).toMatchObject({
      'line_items[0][price_data][product_data][name]': 'Натальная карта',
      'line_items[0][price_data][unit_amount]': '1900',
      'line_items[0][price_data][currency]': 'eur',
      customer_email: 'buyer@orders.test',
      success_url: page,
      cancel_url: page,
      'payment_intent_data[description]': 'Chronika · Натальная карта',
    });
    expect(headers['idempotency-key']).toBe(`checkout-${created.order_id}`);
    for (const secret of ['Оксана', 'Киев', '1990', 'Kyiv', 'evil.test', 'Whatever']) {
      expect(JSON.stringify(fields)).not.toContain(secret);
    }

    const row = await orderRow(created.order_id);
    expect(row).toMatchObject({ status: 'pending', email: 'buyer@orders.test', currency: 'EUR', hold: null });
    expect(String(row?.stripe_session_id)).toBe(created.checkout_url?.split('/').pop());
    expect(row?.checkout_at).toBeTruthy();
  });

  it('names the product in the buyer’s language', async () => {
    const response = await post({ ...ORDER, product: 'synastry', locale: 'en', birth_second: { ...BIRTH, name: 'Igor' } });
    const created = (await response.json()) as Created;
    const { fields } = (await lastRequest(`stripe|checkout|${created.order_id}`)) as { fields: Record<string, string> };
    expect(fields['line_items[0][price_data][product_data][name]']).toBe('Compatibility');
  });

  it('refuses each malformed field by name', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const cases: [Record<string, unknown>, string][] = [
      [{ email: 'nope' }, 'email'],
      [{ email: `${'a'.repeat(250)}@x.io` }, 'email'],
      [{ email: 42 }, 'email'],
      [{ product: 'tarot' }, 'product'],
      [{ locale: 'de' }, 'locale'],
      [{ currency: 'EURO' }, 'currency'],
      [{ currency: 'E1R' }, 'currency'],
      [{ amount_minor: 49 }, 'amount_minor'],
      [{ amount_minor: 1_000_001 }, 'amount_minor'],
      [{ amount_minor: 1900.5 }, 'amount_minor'],
      [{ amount_minor: '1900' }, 'amount_minor'],
      [{ birth: undefined }, 'birth'],
      [{ birth: { ...BIRTH, date: '17.05.1990' } }, 'birth.date'],
      [{ birth: { ...BIRTH, date: '1990-02-30' } }, 'birth.date'],
      [{ birth: { ...BIRTH, date: '1899-12-31' } }, 'birth.date'],
      [{ birth: { ...BIRTH, date: tomorrow } }, 'birth.date'],
      [{ birth: { ...BIRTH, time: '25:00' } }, 'birth.time'],
      [{ birth: { ...BIRTH, time: undefined } }, 'birth.time'],
      [{ birth: { ...BIRTH, latitude: 90.5 } }, 'birth.latitude'],
      [{ birth: { ...BIRTH, latitude: '50' } }, 'birth.latitude'],
      [{ birth: { ...BIRTH, longitude: -180.1 } }, 'birth.longitude'],
      [{ birth: { ...BIRTH, zone: '' } }, 'birth.zone'],
      [{ birth: { ...BIRTH, zone: 'Z'.repeat(65) } }, 'birth.zone'],
      [{ birth: { ...BIRTH, place: 'П'.repeat(121) } }, 'birth.place'],
      [{ birth: { ...BIRTH, name: 'И'.repeat(81) } }, 'birth.name'],
      [{ birth: { ...BIRTH, name: '   ' } }, 'birth.name'],
      [{ birth: { ...BIRTH, gender: 'x' } }, 'birth.gender'],
      [{ product: 'synastry' }, 'birth_second'],
      [{ product: 'synastry', birth_second: { ...BIRTH, date: 'вчера' } }, 'birth_second.date'],
    ];
    for (const [patch, field] of cases) {
      const response = await post({ ...ORDER, ...patch });
      expect(response.status, JSON.stringify(patch)).toBe(400);
      expect(await response.json(), JSON.stringify(patch)).toEqual({ error: 'invalid', field });
    }
  });

  it('accepts the edges of every range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const patch of [
      { amount_minor: 50 },
      { amount_minor: 1_000_000 },
      { birth: { ...BIRTH, date: '1900-01-01', time: null, latitude: -90, longitude: 180 } },
      { birth: { ...BIRTH, date: today, name: 'И'.repeat(80), place: 'П'.repeat(120), zone: 'Z'.repeat(64) } },
    ]) {
      expect((await post({ ...ORDER, ...patch })).status, JSON.stringify(patch)).toBe(201);
    }
  });

  it('takes control characters out of names and places before storing them', async () => {
    const nul = String.fromCharCode(0);
    const response = await post({
      ...ORDER,
      birth: { ...BIRTH, name: `Ok${nul}sa\nna`, place: `Ки${nul}ев\r\n` },
    });
    const { order_id } = (await response.json()) as Created;
    const chart = await testEnv.DB.prepare('SELECT birth_ciphertext, birth_nonce FROM charts WHERE order_id = ?')
      .bind(order_id)
      .first<{ birth_ciphertext: number[]; birth_nonce: number[] }>();
    const birth = await decryptJson<{ name: string; place: string }>(
      chart!.birth_ciphertext,
      chart!.birth_nonce,
      testEnv.DATA_KEY,
    );
    expect(birth).toMatchObject({ name: 'Oksa na', place: 'Киев' });
  });

  it('keeps labels that look like what the site sends and drops the rest', async () => {
    const response = await post({ ...ORDER, country: 'Ukraine', variant: '<b>', consent: 'yes', source: 'Meta Ads!' });
    const { order_id } = (await response.json()) as Created;
    expect(await orderRow(order_id)).toMatchObject({ country: null, variant: null, consent: null, source: 'metaads' });
  });

  it('answers 413 for a body over 16 KB, by its header or by what arrives', async () => {
    const big = JSON.stringify({ ...ORDER, padding: 'x'.repeat(17 * 1024) });
    expect((await post(big)).status).toBe(413);
    const bytes = new TextEncoder().encode(big);
    const stream = new ReadableStream({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 4096) controller.enqueue(bytes.slice(at, at + 4096));
        controller.close();
      },
    });
    const streamed = await SELF.fetch('https://jobs.test/v1/orders', { method: 'POST', headers: SITE, body: stream });
    expect(streamed.status).toBe(413);
  });

  it('answers 400 for a body that is not a JSON object', async () => {
    for (const body of ['{not json', '[]', 'null', '"text"']) {
      const response = await post(body);
      expect(response.status, body).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid', field: 'body' });
    }
  });

  it('refuses an order without Stripe, unless free orders are on or the test key is sent', async () => {
    const noStripe = envWith('STRIPE_SECRET_KEY', undefined);
    const refused = await postWith(noStripe, ORDER);
    expect(refused.status).toBe(503);

    const free = Object.create(noStripe);
    Object.defineProperty(free, 'ALLOW_FREE_ORDERS', { value: '1' });
    const freeOrder = await postWith(free, ORDER);
    expect(freeOrder.status).toBe(201);
    const created = (await freeOrder.json()) as Created;
    expect(created.checkout_url).toBeUndefined();
    expect(await orderRow(created.order_id)).toMatchObject({ status: 'test' });

    const keyed = envWith('TEST_ORDER_KEY', 'test-order-key');
    const test = (await (await postWith(keyed, ORDER, { 'x-test-order': 'test-order-key' })).json()) as Created;
    expect(test.checkout_url).toBeUndefined();
    expect(await orderRow(test.order_id)).toMatchObject({ status: 'test' });

    for (const wrong of ['test-order-ke', 'test-order-keyy', 'x']) {
      const paid = (await (await postWith(keyed, ORDER, { 'x-test-order': wrong })).json()) as Created;
      expect(paid.checkout_url, wrong).toBeTruthy();
      expect(await orderRow(paid.order_id)).toMatchObject({ status: 'pending' });
    }
    // Free orders mean nothing once Stripe is configured.
    const withStripe = envWith('ALLOW_FREE_ORDERS', '1');
    const charged = (await (await postWith(withStripe, ORDER)).json()) as Created;
    expect(charged.checkout_url).toBeTruthy();
  });

  it('answers 502 when Stripe refuses, and keeps the order pending', async () => {
    const response = await post({ ...ORDER, email: 'fail-checkout@orders.test' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'checkout' });
  });
});

describe('GET /v1/jobs/{token}', () => {
  const status = async (token: string) => {
    const response = await SELF.fetch(`https://jobs.test/v1/jobs/${token}`, { headers: SITE });
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  };
  const setOrder = (orderId: string, status: string, hold: string | null) =>
    testEnv.DB.prepare('UPDATE orders SET status = ?, hold = ? WHERE id = ?').bind(status, hold, orderId).run();

  it('says what became of the order, and offers the PDF only while it is paid for', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Статус' });
    const token = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 600);
    expect(await status(token)).toMatchObject({ order_status: 'test', paid: true, test: true, download: null, error: null });

    await runJob(jobId);
    expect(await status(token)).toMatchObject({ order_status: 'test', step: 'done', download: `/d/${token}`, pages: 7 });
    const pdf = await SELF.fetch(`https://jobs.test/d/${token}`, { headers: SITE });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');

    await setOrder(orderId, 'paid', null);
    expect(await status(token)).toMatchObject({ order_status: 'paid', paid: true, amount_minor: 0, currency: 'EUR' });

    await setOrder(orderId, 'paid', 'disputed');
    expect(await status(token)).toMatchObject({ order_status: 'disputed', download: null, pages: null });
    expect((await SELF.fetch(`https://jobs.test/d/${token}`, { headers: SITE })).status).toBe(410);

    await setOrder(orderId, 'refunded', null);
    expect(await status(token)).toMatchObject({ order_status: 'refunded', paid: false, download: null });
    expect((await SELF.fetch(`https://jobs.test/d/${token}`, { headers: SITE })).status).toBe(410);

    await setOrder(orderId, 'paid', null);
    expect((await SELF.fetch(`https://jobs.test/d/${token}`, { headers: SITE })).status).toBe(200);
  });

  it('reports an unpaid order and a payment of the wrong amount', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Неоплата' });
    const token = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 600);
    await setOrder(orderId, 'pending', null);
    expect(await status(token)).toMatchObject({ order_status: 'pending', paid: false, amount_minor: null });
    await setOrder(orderId, 'pending', 'amount_mismatch');
    expect(await status(token)).toMatchObject({ order_status: 'failed', paid: false });
  });

  it('gives a failed job’s error as a code, never the reason', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Ошибка' });
    await testEnv.DB.prepare("UPDATE jobs SET status = 'failed', last_error = '/v1/section → 503' WHERE id = ?")
      .bind(jobId)
      .run();
    const token = await signLink('order', { order: orderId, job: jobId }, testEnv.LINK_KEY, 600);
    expect(await status(token)).toMatchObject({ status: 'failed', error: 'failed' });
  });
});
