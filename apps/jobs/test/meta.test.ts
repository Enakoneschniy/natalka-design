import { describe, expect, it } from 'vitest';
import { decryptJson, sha256Hex } from '../src/crypto';
import type { Env } from '../src/env';
import { type Browser, majorUnits, metaPayload, parseBrowser } from '../src/meta';
import { sweep } from '../src/retention';
import { envWith, fetchSettled, lastRequest, letters, testEnv } from './env';

const SITE = { 'x-site-key': 'test-site-key', 'content-type': 'application/json' };

const BROWSER: Browser = {
  ip: '203.0.113.7',
  ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0',
  fbp: 'fb.1.1761600000000.1234567890',
  fbc: 'fb.1.1761600000000.IwAR2abc_DEF-123',
};

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

const order = (email: string, patch: Record<string, unknown> = {}) => ({
  email,
  product: 'natal',
  locale: 'uk',
  country: 'UA',
  amount_minor: 79000,
  currency: 'UAH',
  consent: 'granted',
  source: 'meta',
  browser: BROWSER,
  birth: BIRTH,
  ...patch,
});

const post = (path: string, body: unknown, env: Env = testEnv, headers: Record<string, string> = {}) =>
  fetchSettled(
    new Request(`https://jobs.test${path}`, { method: 'POST', headers: { ...SITE, ...headers }, body: JSON.stringify(body) }),
    env,
  );

interface Sent {
  path: string;
  search: string;
  body: { access_token: string; test_event_code?: string; data: Record<string, any>[] };
}

/** What the fake Graph API was told under an event id, oldest first. */
const sent = async (eventId: string): Promise<Sent[]> => ((await lastRequest(`meta|${eventId}`)) as Sent[] | null) ?? [];

const hash = (value: string) => sha256Hex(new TextEncoder().encode(value).buffer as ArrayBuffer);

const browserOf = (orderId: string) =>
  testEnv.DB.prepare('SELECT browser_ct, browser_nonce FROM orders WHERE id = ?')
    .bind(orderId)
    .first<{ browser_ct: ArrayBuffer | null; browser_nonce: ArrayBuffer | null }>();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** checkout.session.completed for an order, signed as Stripe signs it. */
async function paid(orderId: string, jobId: string, amount: number, currency: string): Promise<Response> {
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${orderId}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_${orderId}`,
        amount_subtotal: amount,
        currency: currency.toLowerCase(),
        metadata: { order_id: orderId, job_id: jobId },
      },
    },
  });
  const t = Math.floor(Date.now() / 1000);
  const signature = await hmac('whsec_test_fake', `${t}.${payload}`);
  return fetchSettled(
    new Request('https://jobs.test/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=${signature}` },
      body: payload,
    }),
  );
}

describe('parseBrowser', () => {
  it('keeps what a browser and the pixel produce', () => {
    expect(parseBrowser(BROWSER)).toEqual(BROWSER);
    expect(parseBrowser({ ...BROWSER, ip: '2001:db8::1' })?.ip).toBe('2001:db8::1');
  });

  it('drops anything else, field by field, and refuses a browser without a user agent', () => {
    expect(parseBrowser({ ua: 'UA', ip: '1.2.3.4; drop', fbp: 'fb.1.x.1', fbc: 'fb.1.1761600000000.a b' })).toEqual({
      ip: null,
      ua: 'UA',
      fbp: null,
      fbc: null,
    });
    expect(parseBrowser({ ...BROWSER, ua: '' })).toBeNull();
    expect(parseBrowser({ ...BROWSER, ua: '\u0000\u0007' })).toBeNull();
    expect(parseBrowser('Mozilla')).toBeNull();
    expect(parseBrowser(null)).toBeNull();
  });
});

describe('metaPayload', () => {
  it('hashes the address and the country the way Meta asks, and says nothing about the chart', async () => {
    const event = await metaPayload(
      {
        name: 'Purchase',
        id: 'purchase-1',
        url: 'https://chronika.test/uk/checkout',
        browser: BROWSER,
        email: ' Buyer@Example.COM ',
        externalId: 'order-1',
        country: 'UA',
        product: 'bundle',
        amountMinor: 129000,
        currency: 'uah',
        orderId: 'order-1',
      },
      1761600000,
    );
    expect(event).toEqual({
      event_name: 'Purchase',
      event_time: 1761600000,
      event_id: 'purchase-1',
      action_source: 'website',
      event_source_url: 'https://chronika.test/uk/checkout',
      user_data: {
        client_user_agent: BROWSER.ua,
        client_ip_address: BROWSER.ip,
        fbp: BROWSER.fbp,
        fbc: BROWSER.fbc,
        em: [await hash('buyer@example.com')],
        external_id: [await hash('order-1')],
        country: [await hash('ua')],
      },
      custom_data: {
        content_ids: ['bundle'],
        content_type: 'product',
        contents: [{ id: 'bundle', quantity: 1 }],
        num_items: 1,
        currency: 'UAH',
        value: 1290,
        order_id: 'order-1',
      },
    });
  });

  it('leaves out what it does not have', async () => {
    const event = await metaPayload({
      name: 'StartTrial',
      id: 'trial-1',
      url: 'https://chronika.test/ru/subscription/confirm',
      browser: { ip: null, ua: 'UA', fbp: null, fbc: null },
    });
    expect(event.user_data).toEqual({ client_user_agent: 'UA' });
    expect(event).not.toHaveProperty('custom_data');
  });

  it('reads minor units by the currency', () => {
    expect(majorUnits(1900, 'EUR')).toBe(19);
    expect(majorUnits(79000, 'UAH')).toBe(790);
    expect(majorUnits(2500, 'JPY')).toBe(2500);
  });
});

describe('InitiateCheckout and Purchase', () => {
  it('keeps the browser encrypted with the order, reports both, and clears it once paid', async () => {
    const created = await post('/v1/orders', order('paid@meta.test'));
    expect(created.status).toBe(201);
    const { order_id: orderId, job_id: jobId } = (await created.json()) as { order_id: string; job_id: string };

    const kept = await browserOf(orderId);
    expect(kept?.browser_ct).toBeTruthy();
    expect(await decryptJson(kept?.browser_ct as ArrayBuffer, kept?.browser_nonce as ArrayBuffer, testEnv.DATA_KEY)).toEqual(BROWSER);

    const [checkout] = await sent(`checkout-${orderId}`);
    expect(checkout?.path).toBe('/v26.0/test-pixel/events');
    // The token travels in the body, never in a URL.
    expect(checkout?.search).toBe('');
    expect(checkout?.body.access_token).toBe('test-capi-token');
    expect(checkout?.body).not.toHaveProperty('test_event_code');
    const initiate = checkout?.body.data[0];
    expect(initiate).toMatchObject({
      event_name: 'InitiateCheckout',
      event_source_url: 'https://chronika.test/uk/checkout',
      user_data: { client_ip_address: BROWSER.ip, fbc: BROWSER.fbc, em: [await hash('paid@meta.test')] },
      custom_data: { value: 790, currency: 'UAH', order_id: orderId, content_ids: ['natal'] },
    });
    // Nothing from the birth reaches Meta, in any form.
    const text = JSON.stringify(checkout);
    for (const value of ['1990-05-17', '14:30', 'Оксана', 'Киев', 'Europe/Kyiv', '50.45']) {
      expect(text).not.toContain(value);
    }

    expect((await paid(orderId, jobId, 79000, 'UAH')).status).toBe(200);
    const [purchase] = await sent(`purchase-${orderId}`);
    expect(purchase?.body.data[0]).toMatchObject({
      event_name: 'Purchase',
      user_data: { client_user_agent: BROWSER.ua, fbp: BROWSER.fbp, external_id: [await hash(orderId)] },
      custom_data: { value: 790, currency: 'UAH', order_id: orderId },
    });
    expect(await browserOf(orderId)).toEqual({ browser_ct: null, browser_nonce: null });

    // Stripe delivers the event again: no second Purchase.
    await paid(orderId, jobId, 79000, 'UAH');
    expect(await sent(`purchase-${orderId}`)).toHaveLength(1);
  });

  it('keeps nothing and reports nothing without a yes to the cookies', async () => {
    for (const consent of ['denied', null]) {
      const created = await post('/v1/orders', order(`no-${consent}@meta.test`, { consent }));
      const { order_id: orderId, job_id: jobId } = (await created.json()) as { order_id: string; job_id: string };
      expect(await browserOf(orderId)).toEqual({ browser_ct: null, browser_nonce: null });
      await paid(orderId, jobId, 79000, 'UAH');
      expect(await sent(`checkout-${orderId}`)).toEqual([]);
      expect(await sent(`purchase-${orderId}`)).toEqual([]);
    }
  });

  it('keeps nothing while Meta is not configured, and nothing for a test order', async () => {
    const off = await post('/v1/orders', order('off@meta.test'), envWith('META_CAPI_TOKEN', undefined));
    const { order_id: offId } = (await off.json()) as { order_id: string };
    expect(await browserOf(offId)).toEqual({ browser_ct: null, browser_nonce: null });
    expect(await sent(`checkout-${offId}`)).toEqual([]);

    const free = await post('/v1/orders', order('free@meta.test'), envWith('TEST_ORDER_KEY', 'free-key'), {
      'x-test-order': 'free-key',
    });
    const { order_id: freeId } = (await free.json()) as { order_id: string };
    expect(await browserOf(freeId)).toEqual({ browser_ct: null, browser_nonce: null });
    expect(await sent(`checkout-${freeId}`)).toEqual([]);
  });

  it('sends the test code while one is set', async () => {
    const created = await post('/v1/orders', order('code@meta.test'), envWith('META_TEST_EVENT_CODE', 'TEST123'));
    const { order_id: orderId } = (await created.json()) as { order_id: string };
    expect((await sent(`checkout-${orderId}`))[0]?.body.test_event_code).toBe('TEST123');
  });

  it('forgets a browser after a week, paid or not', async () => {
    const created = await post('/v1/orders', order('old@meta.test'));
    const { order_id: orderId } = (await created.json()) as { order_id: string };
    await testEnv.DB.prepare('UPDATE orders SET created_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 8 * 86_400_000).toISOString(), orderId)
      .run();
    const report = await sweep(testEnv);
    expect(report['order browsers']).toBeGreaterThanOrEqual(1);
    const row = await testEnv.DB.prepare('SELECT browser_ct FROM orders WHERE id = ?').bind(orderId).first();
    // The unpaid order itself may be gone already; if it is still there, its browser is not.
    expect(row?.browser_ct ?? null).toBeNull();
  });
});

describe('POST /v1/conversions/view', () => {
  it('reports a ViewContent for the preview, without its query string', async () => {
    const ua = `ViewContent ${crypto.randomUUID()}`;
    const response = await post('/v1/conversions/view', {
      product: 'bundle',
      locale: 'ru',
      country: 'DE',
      amount_minor: 3900,
      currency: 'EUR',
      browser: { ...BROWSER, ua },
    });
    expect(response.status).toBe(202);
    const events = await viewsFrom(ua);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_name: 'ViewContent',
      event_source_url: 'https://chronika.test/ru/preview',
      user_data: { country: [await hash('de')] },
      custom_data: { content_ids: ['bundle'], value: 39, currency: 'EUR' },
    });
  });

  it('answers the same without a browser and reports nothing', async () => {
    const response = await post('/v1/conversions/view', { product: 'natal', locale: 'ru' });
    expect(response.status).toBe(202);
  });

  it('refuses a product or a language it does not know', async () => {
    expect((await post('/v1/conversions/view', { product: 'tarot', locale: 'ru', browser: BROWSER })).status).toBe(400);
    expect((await post('/v1/conversions/view', { product: 'natal', locale: 'fr', browser: BROWSER })).status).toBe(400);
  });

  it('is behind the site key', async () => {
    const response = await fetchSettled(
      new Request('https://jobs.test/v1/conversions/view', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: 'natal', locale: 'ru', browser: BROWSER }),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe('StartTrial', () => {
  it('reports the free month once, from the browser that confirmed it', async () => {
    const email = 'trial@meta.test';
    await post('/v1/subscriptions', { email, locale: 'uk', cadence: 'week', birth: BIRTH });
    const token = (await letters(email))
      .map((letter) => letter.text.match(/\/subscription\/confirm\?t=(\S+)/)?.[1])
      .find(Boolean);
    const first = await post('/v1/subscriptions/confirm', { token, browser: BROWSER });
    expect(first.status).toBe(200);
    const sub = await testEnv.DB.prepare('SELECT id FROM subscriptions WHERE email = ?').bind(email).first<{ id: string }>();
    const [trial] = await sent(`trial-${sub?.id}`);
    expect(trial?.body.data[0]).toMatchObject({
      event_name: 'StartTrial',
      event_source_url: 'https://chronika.test/uk/subscription/confirm',
      user_data: { em: [await hash(email)], client_user_agent: BROWSER.ua },
      custom_data: { content_ids: ['horoscope'] },
    });
    expect(JSON.stringify(trial)).not.toContain('1990-05-17');

    // The link used again starts nothing new and reports nothing new.
    await post('/v1/subscriptions/confirm', { token, browser: BROWSER });
    expect(await sent(`trial-${sub?.id}`)).toHaveLength(1);
  });

  it('reports nothing when the site sends no browser', async () => {
    const email = 'trial-quiet@meta.test';
    await post('/v1/subscriptions', { email, locale: 'ru', cadence: 'month', birth: BIRTH });
    const token = (await letters(email))
      .map((letter) => letter.text.match(/\/subscription\/confirm\?t=(\S+)/)?.[1])
      .find(Boolean);
    expect((await post('/v1/subscriptions/confirm', { token })).status).toBe(200);
    const sub = await testEnv.DB.prepare('SELECT id FROM subscriptions WHERE email = ?').bind(email).first<{ id: string }>();
    expect(await sent(`trial-${sub?.id}`)).toEqual([]);
  });
});

/** A view's id is random, so its events are found among all of them by the user agent the test
 * chose. */
async function viewsFrom(ua: string): Promise<Record<string, any>[]> {
  const all = (await lastRequest('meta|*')) as Sent[] | null;
  return (all ?? []).map((s) => s.body.data[0]).filter((event) => event?.user_data?.client_user_agent === ua) as Record<string, any>[];
}
