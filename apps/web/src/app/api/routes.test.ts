import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedPreview } from '@/lib/preview';
import { GET as document } from './documents/[token]/route';
import { POST as resume } from './jobs/[token]/checkout/route';
import { GET as status } from './jobs/[token]/route';
import { POST as order } from './orders/route';
import { POST as preview } from './preview/route';
import {
  PATCH as changeSubscription,
  GET as subscription,
  DELETE as unsubscribe,
} from './subscriptions/[token]/route';
import { POST as confirm } from './subscriptions/confirm/route';
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
    vi.stubEnv('PREVIEW_KEY', 'p'.repeat(32));
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
      const signed = await signedPreview({ facts: { birth: {} }, lang: 'ru', product: 'natal' });
      const answers = [
        await status(get('/api/jobs/t'), token('t')),
        await document(get('/api/documents/t'), token('t')),
        await preview(send('/api/preview', signed)),
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

    it('keeps the campaign only as a clean label', async () => {
      fetchMock.mockResolvedValueOnce(reply(201, created));
      await order(send('/api/orders', validOrder, 'POST', { cookie: 'chr_src=Meta<b>(x)' }));
      expect(forwarded().body.source).toBe('metabx');
      fetchMock.mockResolvedValueOnce(reply(201, created));
      await order(send('/api/orders', validOrder, 'POST', { cookie: 'chr_src=<>!' }));
      expect(forwarded(1).body.source).toBeNull();
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

    it('passes on only the order, its job and its token, and nothing without a token', async () => {
      fetchMock.mockResolvedValueOnce(reply(201, { ...created, internal: 'x' }));
      expect(await (await order(send('/api/orders', validOrder))).json()).toEqual(created);
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
      expect((await order(send('/api/orders', validOrder))).status).toBe(503);
    });

    it('does not sell where the payment provider forbids it', async () => {
      const answer = await order(send('/api/orders', validOrder, 'POST', { 'cf-ipcountry': 'JP' }));
      expect(answer.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('the waiting page', () => {
    const upstreamStatus = {
      step: 'texts',
      status: 'running',
      paid: true,
      test: false,
      order_status: 'paid',
      order_id: 'o1',
      amount_minor: 2900,
      currency: 'EUR',
      written: 3,
      total: 12,
      progress: 25,
      error: null,
      pages: null,
      download: null,
    };

    it('passes on the status with its order state and only the fields it knows', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, { ...upstreamStatus, order_status: 'refunded', internal: 'x' }),
      );
      const answer = await status(get('/api/jobs/a.b.c'), token('a.b.c'));
      const body = (await answer.json()) as Record<string, unknown>;
      expect(body.order_status).toBe('refunded');
      expect(body).not.toHaveProperty('internal');
      expect(forwarded().url).toBe('https://jobs.test/v1/jobs/a.b.c');
    });

    it('turns any error into the code `failed`', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, { ...upstreamStatus, status: 'failed', error: 'calc → 500 at host x' }),
      );
      const body = (await (await status(get('/api/jobs/t'), token('t'))).json()) as {
        error: unknown;
      };
      expect(body.error).toBe('failed');
    });

    it('tells a dead link from an outage', async () => {
      fetchMock.mockResolvedValueOnce(reply(404, { error: 'link expired' }));
      expect((await status(get('/api/jobs/t'), token('t'))).status).toBe(404);
      fetchMock.mockResolvedValueOnce(reply(500, { error: 'boom' }));
      expect((await status(get('/api/jobs/t'), token('t'))).status).toBe(503);
    });

    it('opens a new payment page for an unpaid order, on Stripe only', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, { checkout_url: 'https://checkout.stripe.com/c/pay/cs_2' }),
      );
      const answer = await resume(send('/api/jobs/a.b.c/checkout', {}), token('a.b.c'));
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_2',
      });
      const call = forwarded();
      expect(call.url).toBe('https://jobs.test/v1/jobs/a.b.c/checkout');
      expect(call.headers.get('x-site-key')).toBe('site-key-123');

      fetchMock.mockResolvedValueOnce(reply(200, { checkout_url: 'https://pay.evil.example/' }));
      const elsewhere = await resume(send('/api/jobs/t/checkout', {}), token('t'));
      expect(elsewhere.status).toBe(503);
    });

    it('says when there is nothing to pay, and nothing more', async () => {
      fetchMock.mockResolvedValueOnce(reply(409, { error: 'paid' }));
      const paid = await resume(send('/api/jobs/t/checkout', {}), token('t'));
      expect(paid.status).toBe(409);
      expect(await paid.json()).toEqual({ error: 'paid' });

      fetchMock.mockResolvedValueOnce(reply(409, { error: 'closed', detail: 'refunded' }));
      const closed = await resume(send('/api/jobs/t/checkout', {}), token('t'));
      expect(await closed.json()).toEqual({ error: 'closed' });

      fetchMock.mockResolvedValueOnce(reply(404, { error: 'link expired' }));
      expect((await resume(send('/api/jobs/t/checkout', {}), token('t'))).status).toBe(404);

      fetchMock.mockResolvedValueOnce(reply(500, { error: 'boom' }));
      expect((await resume(send('/api/jobs/t/checkout', {}), token('t'))).status).toBe(502);
    });

    it('takes the request from our own page only', async () => {
      const crossSite = await resume(
        send('/api/jobs/t/checkout', {}, 'POST', { 'sec-fetch-site': 'cross-site' }),
        token('t'),
      );
      expect(crossSite.status).toBe(403);
      const form = await resume(
        send('/api/jobs/t/checkout', {}, 'POST', { 'content-type': 'text/plain' }),
        token('t'),
      );
      expect(form.status).toBe(415);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    const facts = {
      first: { birth: { date: '1990-05-15' }, positions: [{ body: 'sun', longitude: 54.25 }] },
      second: { birth: { date: '1992-01-02' }, positions: [{ body: 'sun', longitude: 281.5 }] },
    };
    const sign = () =>
      signedPreview({
        facts,
        lang: 'ru',
        product: 'synastry',
        first_name: 'Анна',
        second_name: 'Борис',
      });

    it('asks the jobs worker about the signed chart only, and returns the passages only', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          blocks: [{ title: 'Т', text: 'Текст', extra: 1 }],
          cached: true,
          model: 'm',
        }),
      );
      const answer = await preview(send('/api/preview', { ...(await sign()), model: 'other' }));
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ blocks: [{ title: 'Т', text: 'Текст' }] });
      const call = forwarded();
      expect(call.url).toBe('https://jobs.test/v1/preview');
      expect(call.headers.get('x-site-key')).toBe('site-key-123');
      expect(call.body).toEqual({
        facts,
        lang: 'ru',
        product: 'synastry',
        first_name: 'Анна',
        second_name: 'Борис',
      });
    });

    it('refuses a request without the signature or with anything changed', async () => {
      const signed = await sign();
      if (!signed) throw new Error('not signed');
      const { sig: _sig, ...unsigned } = signed;
      for (const body of [
        unsigned,
        { ...signed, first_name: 'Мария' },
        { ...signed, facts: { ...facts, second: facts.first } },
        { ...signed, sig: '0'.repeat(64) },
      ]) {
        const answer = await preview(send('/api/preview', body));
        expect(answer.status).toBe(400);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks nothing without a preview key, and says why in the log', async () => {
      const signed = await sign();
      vi.stubEnv('PREVIEW_KEY', '');
      const answer = await preview(send('/api/preview', signed));
      expect(answer.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logged.mock.calls.flat().join(' ')).toContain('PREVIEW_KEY is not configured');
    });

    it('refuses a body over 64 KB and a request from another site', async () => {
      const large = await preview(
        send('/api/preview', { ...(await sign()), padding: 'x'.repeat(64 * 1024) }),
      );
      expect(large.status).toBe(413);
      const crossSite = await preview(
        send('/api/preview', await sign(), 'POST', { 'sec-fetch-site': 'cross-site' }),
      );
      expect(crossSite.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says the passages are unavailable when the jobs worker cannot write them', async () => {
      fetchMock.mockResolvedValueOnce(reply(503, { error: 'preview unavailable' }));
      expect((await preview(send('/api/preview', await sign()))).status).toBe(503);
      fetchMock.mockResolvedValueOnce(reply(200, { blocks: [] }));
      expect((await preview(send('/api/preview', await sign()))).status).toBe(503);
    });
  });

  describe('subscriptions', () => {
    const request = { email: 'anna@example.com', locale: 'ru', cadence: 'week', birth: person };

    it('answers «pending» and nothing more, whatever the jobs worker gives back', async () => {
      fetchMock.mockResolvedValueOnce(reply(202, { status: 'pending', token: 'manage-me' }));
      const answer = await subscribe(send('/api/subscriptions', { ...request, extra: 1 }));
      expect(answer.status).toBe(202);
      expect(await answer.json()).toEqual({ status: 'pending' });
      const call = forwarded();
      expect(call.url).toBe('https://jobs.test/v1/subscriptions');
      expect(call.headers.get('x-site-key')).toBe('site-key-123');
      expect(call.body).toEqual(request);
    });

    it('holds the birth to an order’s limits and takes our own pages only', async () => {
      const longName = await subscribe(
        send('/api/subscriptions', { ...request, birth: { ...person, name: 'и'.repeat(81) } }),
      );
      expect(longName.status).toBe(400);
      expect(await longName.json()).toEqual({ error: 'invalid', field: 'birth.name' });
      const crossSite = await subscribe(
        send('/api/subscriptions', request, 'POST', { 'sec-fetch-site': 'cross-site' }),
      );
      expect(crossSite.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('passes a limit from the jobs worker on as it is', async () => {
      fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many' }));
      expect((await subscribe(send('/api/subscriptions', request))).status).toBe(429);
    });

    it('confirms with the token from the letter and gives back the management token', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { token: 'manage.token.x' }));
      const answer = await confirm(send('/api/subscriptions/confirm', { token: 'confirm.t.x' }));
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ token: 'manage.token.x' });
      const call = forwarded();
      expect(call.url).toBe('https://jobs.test/v1/subscriptions/confirm');
      expect(call.body).toEqual({ token: 'confirm.t.x' });
      expect(call.headers.get('x-site-key')).toBe('site-key-123');
    });

    it('says when the letter’s link is no good', async () => {
      fetchMock.mockResolvedValueOnce(reply(404, { error: 'link expired' }));
      const gone = await confirm(send('/api/subscriptions/confirm', { token: 'old' }));
      expect(gone.status).toBe(404);
      const missing = await confirm(send('/api/subscriptions/confirm', { token: 42 }));
      expect(missing.status).toBe(400);
      fetchMock.mockResolvedValueOnce(reply(200, {}));
      const empty = await confirm(send('/api/subscriptions/confirm', { token: 't' }));
      expect(empty.status).toBe(503);
    });

    it('confirms nothing for a request from another site', async () => {
      const answer = await confirm(
        send('/api/subscriptions/confirm', { token: 't' }, 'POST', {
          'sec-fetch-site': 'cross-site',
        }),
      );
      expect(answer.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('changes a subscription only from our own page, with only what may change', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
      const changed = await changeSubscription(
        send(
          '/api/subscriptions/t',
          { cadence: 'month', status: 'active', email: 'x@y.z' },
          'PATCH',
        ),
        token('t'),
      );
      expect(changed.status).toBe(200);
      expect(forwarded().body).toEqual({ cadence: 'month', status: 'active' });

      const unknown = await changeSubscription(
        send('/api/subscriptions/t', { status: 'ended' }, 'PATCH'),
        token('t'),
      );
      expect(unknown.status).toBe(400);
      const crossSite = await changeSubscription(
        send('/api/subscriptions/t', { cadence: 'week' }, 'PATCH', {
          'sec-fetch-site': 'cross-site',
        }),
        token('t'),
      );
      expect(crossSite.status).toBe(403);
      const removed = await unsubscribe(
        send('/api/subscriptions/t', undefined, 'DELETE', { 'sec-fetch-site': 'cross-site' }),
        token('t'),
      );
      expect(removed.status).toBe(403);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
