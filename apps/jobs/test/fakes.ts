/** Stand-ins for the Python text API and the ephemeris service, bound into the worker under test
 * as service bindings. They run in Node, outside the worker. A test arms a failure by POSTing
 * { key, times } to /__fail on the API binding; keys name the client, so tests running side by
 * side never trip each other ("<name>|pdf" fails the skeleton, "<name>|nobrand" drops the brand from
 * it). A birth date of 1900-01-01 always fails the calculation. */

export const FAKE_PLAN = [
  { id: 'a', title: 'Первая', quote: false },
  { id: 'b', title: 'Вторая', quote: true },
  { id: 'c', title: 'Третья', quote: false },
];

const armed = new Map<string, number>();
const lastSeen = new Map<string, unknown>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** True, and one charge used, when a failure is armed under any of these keys. */
function trips(...keys: string[]): boolean {
  for (const key of keys) {
    const left = armed.get(key) ?? 0;
    if (left > 0) {
      armed.set(key, left - 1);
      return true;
    }
  }
  return false;
}

export async function fakeEphemeris(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const body = (await request.json()) as { date?: string; first?: { date: string } };
  const date = body.date ?? body.first?.date;
  if (date === '1900-01-01') return new Response('engine down', { status: 500 });
  if (path === '/v1/synastry') {
    return json({ first: { birth: { date } }, second: { birth: {} }, aspects: [] });
  }
  return json({ birth: { date, unknown_time: false }, planets: [], transits: [] });
}

export async function fakeApi(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/__fail') {
    const { key, times } = (await request.json()) as { key: string; times: number };
    armed.set(key, times);
    return json({ ok: true });
  }
  if (path === '/__last') {
    return json(lastSeen.get(new URL(request.url).searchParams.get('key') ?? '') ?? null);
  }
  if (path === '/v1/sections') {
    // The plan request carries no name, so it is kept by its form of address: test files run side
    // by side, and a single "last" slot is overwritten by whichever file asked most recently.
    const params = Object.fromEntries(new URL(request.url).searchParams);
    lastSeen.set(`/v1/sections|address=${params.address ?? 'vy'}`, params);
    return json({ sections: FAKE_PLAN });
  }
  if (path === '/v1/section') {
    const body = (await request.json()) as { section_id: string; name: string };
    lastSeen.set(`/v1/section|${body.name}`, body);
    if (trips(`${body.name}|${body.section_id}`, `${body.name}|*`)) {
      return new Response('model down', { status: 503 });
    }
    const plan = FAKE_PLAN.find((p) => p.id === body.section_id);
    if (!plan) return new Response(`unknown section: ${body.section_id}`, { status: 404 });
    return json({
      ...plan,
      text: `Текст ${body.section_id} для ${body.name} #${crypto.randomUUID().slice(0, 8)}`,
      problems: [],
      attempts: 1,
      tokens_in: 100,
      tokens_out: 200,
      cost_micros: 1000,
      model: 'fake/model',
    });
  }
  if (path === '/v1/skeleton') {
    const body = (await request.json()) as { name: string; brand?: unknown; order_ref?: string | null };
    lastSeen.set(`/v1/skeleton|${body.name}`, body);
    if (trips(`${body.name}|pdf`)) return new Response('render down', { status: 500 });
    // Like the real API, a brand keeps the order reference off the document. Armed with
    // "<name>|nobrand" it answers like an older image that silently drops the brand.
    const brand = trips(`${body.name}|nobrand`) ? undefined : body.brand;
    return json({ document: true, brand: brand ?? null, meta: { order_ref: brand ? null : (body.order_ref ?? null) } });
  }
  if (path === '/v1/document') {
    return new Response(new Uint8Array([37, 80, 68, 70]), {
      headers: { 'content-type': 'application/pdf', 'x-pages': '7' },
    });
  }
  return new Response('not found', { status: 404 });
}

/** Stand-in for api.stripe.com, bound as the worker's outbound fetch. Checkout creation answers
 * with a fake session and records the form it was sent under "stripe|checkout|<purchase id>" with its headers (read it through
 * the API binding's /__last). Anything else is a 404. */
export async function fakeOutbound(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === 'https://api.stripe.com' && url.pathname === '/v1/checkout/sessions') {
    const fields = Object.fromEntries(new URLSearchParams(await request.text()));
    // A seller with this address makes Checkout fail, with an error body that must never leak.
    if (fields.customer_email?.startsWith('fail-checkout@')) {
      return new Response('stripe-secret-detail: card_declined_internal', { status: 500 });
    }
    lastSeen.set(`stripe|checkout|${fields['metadata[purchase_id]']}`, {
      fields,
      headers: Object.fromEntries(request.headers),
    });
    const id = `cs_test_${crypto.randomUUID().replaceAll('-', '')}`;
    return json({ id, url: `https://checkout.stripe.test/${id}` });
  }
  return new Response('not found', { status: 404 });
}
