import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as document } from './documents/[token]/route';
import { GET as status } from './jobs/[token]/route';
import { POST as order } from './orders/route';
import { POST as preview } from './preview/route';
import {
  PATCH as changeSubscription,
  GET as subscription,
  DELETE as unsubscribe,
} from './subscriptions/[token]/route';
import { POST as subscribe } from './subscriptions/route';

const SHOP = 'chronika.me';

const reply = (code: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status: code });

/** What a same-origin `fetch` from the shop's own page sends. */
const send = (
  path: string,
  body?: unknown,
  method = 'POST',
  headers: Record<string, string> = {},
) =>
  new NextRequest(`https://${SHOP}${path}`, {
    method,
    headers: {
      host: SHOP,
      'sec-fetch-site': 'same-origin',
      origin: `https://${SHOP}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const get = (path: string) => send(path, undefined, 'GET');
const token = (value: string) => ({ params: Promise.resolve({ token: value }) });

const person = {
  date: '1990-05-15',
  time: '14:30',
  latitude: 50.45,
  longitude: 30.52,
  zone: 'Europe/Kyiv',
  place: 'Киев, Украина',
  name: 'Анна',
  gender: 'f',
};
const validOrder = { email: 'anna@example.com', product: 'natal', locale: 'ru', birth: person };

describe('shop API routes and the jobs worker', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const logged = vi.spyOn(console, 'error');
  const forwarded = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
    return {
      url,
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
  };

  beforeEach(() => {
    vi.stubEnv('NATALKA_JOBS_URL', 'https://jobs.test');
    vi.stubEnv('SITE_KEY', 'site-key-123');
    fetchMock.mockReset();
    logged.mockReset();
    logged.mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('without a site key', () => {
    beforeEach(() => vi.stubEnv('SITE_KEY', ''));

    it('answers 503 from every route, calls nothing and says why in the log', async () => {
      const answers = [
        await status(get('/api/jobs/t'), token('t')),
        await document(get('/api/documents/t'), token('t')),
        await preview(send('/api/preview', { facts: {}, lang: 'ru' })),
        await order(send('/api/orders', validOrder)),
        await subscribe(
          send('/api/subscriptions', {
            email: 'anna@example.com',
            locale: 'ru',
            cadence: 'week',
            birth: person,
          }),
        ),
        await subscription(get('/api/subscriptions/t'), token('t')),
        await changeSubscription(
          send('/api/subscriptions/t', { cadence: 'month' }, 'PATCH'),
          token('t'),
        ),
        await unsubscribe(send('/api/subscriptions/t', undefined, 'DELETE'), token('t')),
      ];
      expect(answers.map((answer) => answer.status)).toEqual(Array(answers.length).fill(503));
      expect(fetchMock).not.toHaveBeenCalled();
      const lines = logged.mock.calls.map((call) => call.join(' '));
      expect(lines.length).toBe(answers.length);
      for (const line of lines) expect(line).toContain('SITE_KEY is not configured');
    });

    it('never shows the reason to the browser', async () => {
      const answer = await order(send('/api/orders', validOrder));
      expect(await answer.json()).toEqual({ error: 'unavailable' });
    });
  });

  it('sends the site key on the order and on the document', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { order_id: 'o', job_id: 'j', token: 't' }));
    fetchMock.mockResolvedValueOnce(
      new Response('%PDF', { headers: { 'content-disposition': 'inline; filename="a.pdf"' } }),
    );
    expect((await order(send('/api/orders', validOrder))).status).toBe(201);
    const pdf = await document(get('/api/documents/a.b.c'), token('a.b.c'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(forwarded(0).url).toBe('https://jobs.test/v1/orders');
    expect(forwarded(0).headers.get('x-site-key')).toBe('site-key-123');
    expect(forwarded(1).url).toBe('https://jobs.test/d/a.b.c');
    expect(forwarded(1).headers.get('x-site-key')).toBe('site-key-123');
  });

  it('passes on a missing or withdrawn document by its status alone', async () => {
    fetchMock.mockResolvedValueOnce(new Response('internal detail', { status: 410 }));
    const gone = await document(get('/api/documents/t'), token('t'));
    expect(gone.status).toBe(410);
    expect(await gone.text()).toBe('gone');
    fetchMock.mockResolvedValueOnce(new Response('internal detail', { status: 500 }));
    const broken = await document(get('/api/documents/t'), token('t'));
    expect(broken.status).toBe(502);
    expect(await broken.text()).not.toContain('internal');
  });

  describe('orders', () => {
    const created = { order_id: 'o1', job_id: 'j1', token: 'a.b.c' };

    it('passes on exactly the order fields, priced from our own table', async () => {
      fetchMock.mockResolvedValueOnce(reply(201, created));
      const answer = await order(
        send(
          '/api/orders',
          {
            ...validOrder,
            product: 'synastry',
            birth_second: { ...person, name: 'Борис', gender: 'm' },
            cancel_url: 'https://evil.example',
            product_name: 'Что угодно',
            amount_minor: 1,
          },
          'POST',
          {
            'cf-ipcountry': 'DE',
            cookie: 'chr_consent=granted; chr_src=meta',
          },
        ),
      );
      expect(answer.status).toBe(201);
      expect(await answer.json()).toEqual(created);
      const { body } = forwarded();
      expect(Object.keys(body).sort()).toEqual(
        [
          'amount_minor',
          'birth',
          'birth_second',
          'consent',
          'country',
          'currency',
          'email',
          'locale',
          'product',
          'source',
          'variant',
        ].sort(),
      );
      expect(body).toMatchObject({
        email: 'anna@example.com',
        product: 'synastry',
        locale: 'ru',
        country: 'DE',
        amount_minor: 1700,
        currency: 'EUR',
        consent: 'granted',
        source: 'meta',
      });
      expect(body.birth_second.name).toBe('Борис');
    });

    it('refuses a request from another site or without JSON before reading it', async () => {
      const crossSite = await order(
        send('/api/orders', validOrder, 'POST', { 'sec-fetch-site': 'cross-site' }),
      );
      expect(crossSite.status).toBe(403);
      const form = await order(
        send('/api/orders', validOrder, 'POST', { 'content-type': 'text/plain' }),
      );
      expect(form.status).toBe(415);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('names the field that is wrong and calls nothing', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ ...validOrder, email: 'anna' }, 'email'],
        [{ ...validOrder, product: 'tarot' }, 'product'],
        [{ ...validOrder, birth: { ...person, date: '1850-01-01' } }, 'birth.date'],
        [{ ...validOrder, birth: { ...person, latitude: 91 } }, 'birth.latitude'],
        [{ ...validOrder, birth: { ...person, name: 'и'.repeat(81) } }, 'birth.name'],
        [{ ...validOrder, product: 'synastry' }, 'birth_second'],
      ];
      for (const [body, field] of cases) {
        const answer = await order(send('/api/orders', body));
        expect(answer.status, field).toBe(400);
        expect(await answer.json()).toEqual({ error: 'invalid', field });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a body over 16 KB', async () => {
      const answer = await order(
        send('/api/orders', { ...validOrder, padding: 'x'.repeat(16 * 1024) }),
      );
      expect(answer.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('relays what the jobs worker refuses, and nothing it says', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid', field: 'birth.zone' }));
      const refused = await order(send('/api/orders', validOrder));
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({ error: 'invalid', field: 'birth.zone' });

      fetchMock.mockResolvedValueOnce(reply(503, { error: 'payments are off' }));
      const closed = await order(send('/api/orders', validOrder));
      expect(closed.status).toBe(503);
      expect(await closed.json()).toEqual({ error: 'unavailable' });

      fetchMock.mockResolvedValueOnce(reply(500, { error: 'stack trace' }));
      const broken = await order(send('/api/orders', validOrder));
      expect(broken.status).toBe(502);
      expect(await broken.json()).toEqual({ error: 'unavailable' });
    });

    it('hands the browser a payment page only on Stripe', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(201, { ...created, checkout_url: 'https://checkout.stripe.com/c/pay/cs_1' }),
      );
      const paid = await order(send('/api/orders', validOrder));
      const body = (await paid.json()) as { checkout_url?: string };
      expect(body.checkout_url).toBe('https://checkout.stripe.com/c/pay/cs_1');

      fetchMock.mockResolvedValueOnce(
        reply(201, { ...created, checkout_url: 'https://checkout.stripe.com.evil.example/x' }),
      );
      const elsewhere = await order(send('/api/orders', validOrder));
      expect(elsewhere.status).toBe(503);
      expect(JSON.stringify(await elsewhere.json())).not.toContain('evil');
    });

    it('does not sell where the payment provider forbids it', async () => {
      const answer = await order(send('/api/orders', validOrder, 'POST', { 'cf-ipcountry': 'JP' }));
      expect(answer.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
