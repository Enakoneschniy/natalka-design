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
});
