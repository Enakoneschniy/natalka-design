#!/usr/bin/env node
// A stand-in for the jobs worker's seller-cabinet API (`/v1/pro/*`), for looking at the cabinet
// locally. Dependency-free, in-memory, reset on restart. Never deploy it; it checks nothing.
//
//   node apps/web/scripts/fake-pro-jobs.mjs            # listens on 127.0.0.1:8799 (PORT to change)
//   NATALKA_JOBS_URL=http://127.0.0.1:8799 PRO_API_KEY=dev PRO_HOSTS=localhost:3000 \
//     corepack pnpm --filter @natalka/web dev
//
// Any `x-pro-key` and any bearer are accepted; `POST /v1/pro/session` takes any token. Sign in
// through the site (any address, then open /login/<anything>) or set the `__Host-chp_session`
// cookie by hand; over plain http, where a browser keeps no Secure cookie, set the old name
// `chp_session` instead, which the cabinet still reads. One reading is being written and gains a
// section on every look at it; a bought pack is paid a few seconds after its checkout link is
// opened.

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8799);
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const ago = (days) => iso(Date.now() - days * DAY);
let serial = 100;
const newId = (prefix) => `${prefix}-${(serial++).toString(36)}`;

// ---- the seller ----

const seller = {
  email: 'maria@example.com',
  name: 'Мария Звёздная',
  tone: 'vy',
  balance: 12,
  invite_redeemed: false,
};
const INVITES = { START3: 3 };

// ---- clients ----

const clients = [
  {
    id: 'c-anna',
    name: 'Анна Коваленко',
    date: '1991-05-14',
    time: '07:40',
    latitude: 50.45,
    longitude: 30.52,
    zone: 'Europe/Kyiv',
    place: 'Киев, Украина',
    gender: 'f',
    created_at: ago(20),
  },
  {
    id: 'c-igor',
    name: 'Игорь Мельник',
    date: '1988-03-19',
    time: null,
    latitude: 50.45,
    longitude: 30.52,
    zone: 'Europe/Kyiv',
    place: 'Киев, Украина',
    gender: 'm',
    created_at: ago(12),
  },
  {
    id: 'c-sofia',
    name: 'София Лемешко',
    date: '2019-11-02',
    time: '23:15',
    latitude: 49.84,
    longitude: 24.03,
    zone: 'Europe/Kyiv',
    place: 'Львов, Украина',
    gender: 'f',
    created_at: ago(3),
  },
];

// ---- readings ----

const PLAN_TITLES = [
  'Общий портрет',
  'Солнце: ядро личности',
  'Луна: эмоции и потребности',
  'Асцендент: как вас видят',
  'Меркурий: мышление и речь',
  'Венера: любовь и ценности',
  'Марс: энергия и действие',
  'Призвание и путь',
];

const sectionText = (title, round = 0) =>
  `${title} — это одна из самых <b>заметных</b> тем этой карты. ${
    round > 0 ? `(Переписано, вариант ${round + 1}.) ` : ''
  }Здесь говорится о том, как человек проявляется в повседневной жизни, что даёт ему силы и где он теряет равновесие.\n\nВторой абзац продолжает мысль: <i>подробности</i>, примеры из жизни и мягкие рекомендации. Текст достаточно длинный, чтобы проверить переносы строк, отступы и то, как раздел выглядит на узком экране телефона.`;

const plan = (prefix, n = PLAN_TITLES.length) =>
  PLAN_TITLES.slice(0, n).map((title, i) => ({ id: `${prefix}-s${i + 1}`, title }));

const COST = { natal: 1, forecast: 1, synastry: 1, child: 1, bundle: 2 };

function reading(fields) {
  const p = plan(fields.id, fields.total ?? PLAN_TITLES.length);
  const written = fields.written ?? p.length;
  const skip = new Set(fields.skip ?? []);
  return {
    product: 'natal',
    partner_client_id: null,
    status: 'ready',
    regenerations: 0,
    editable_until: iso(Date.now() + 10 * DAY),
    pdf: 'none',
    pdfReadyAt: null,
    pages: null,
    ...fields,
    plan: p,
    sections: p
      .slice(0, written)
      .filter((s) => !skip.has(s.id))
      .map((s) => ({ ...s, text: sectionText(s.title) })),
  };
}

const readings = [
  reading({
    id: 'r-writing',
    product: 'forecast',
    client_id: 'c-igor',
    status: 'writing',
    written: 2,
    created_at: ago(0),
  }),
  reading({
    id: 'r-ready',
    client_id: 'c-anna',
    pdf: 'ready',
    pages: 24,
    regenerations: 3,
    created_at: ago(1),
  }),
  reading({
    id: 'r-missing',
    product: 'synastry',
    client_id: 'c-anna',
    partner_client_id: 'c-igor',
    total: 6,
    skip: ['r-missing-s4'],
    created_at: ago(4),
  }),
  reading({
    id: 'r-failed',
    product: 'child',
    client_id: 'c-sofia',
    status: 'failed',
    written: 0,
    created_at: ago(5),
  }),
  reading({
    id: 'r-old',
    product: 'bundle',
    client_id: 'c-igor',
    pdf: 'ready',
    pages: 41,
    regenerations: 10,
    editable_until: ago(2),
    created_at: ago(16),
  }),
];

/** One more section on every look, until the reading is ready. */
function advance(r) {
  if (r.status !== 'writing') return;
  const next = r.plan[r.sections.length];
  if (next) r.sections.push({ ...next, text: sectionText(next.title) });
  if (r.sections.length >= r.plan.length) r.status = 'ready';
}

function pdfState(r) {
  if (r.pdf === 'building' && Date.now() >= r.pdfReadyAt) {
    r.pdf = 'ready';
    r.pages = 20 + r.sections.length;
  }
  return r.pdf;
}

function view(r) {
  const written = new Set(r.sections.map((s) => s.id));
  return {
    id: r.id,
    product: r.product,
    client_id: r.client_id,
    partner_client_id: r.partner_client_id,
    status: r.status,
    written: r.sections.length,
    total: r.plan.length,
    sections: r.plan.flatMap((p) => r.sections.filter((s) => s.id === p.id)),
    missing:
      r.status === 'ready'
        ? r.plan.filter((p) => !written.has(p.id)).map(({ id, title }) => ({ id, title }))
        : [],
    regenerations_left: Math.max(0, 10 - r.regenerations),
    editable_until: r.editable_until,
    frozen: r.editable_until <= iso(Date.now()),
    pdf: pdfState(r),
    pages: r.pdf === 'ready' ? r.pages : null,
    created_at: r.created_at,
  };
}

function summary(r) {
  const v = view(r);
  return {
    id: v.id,
    product: v.product,
    client_id: v.client_id,
    partner_client_id: v.partner_client_id,
    status: v.status,
    missing: v.missing.length,
    pdf_ready: v.pdf === 'ready',
    created_at: v.created_at,
  };
}

const newest = (a, b) => (a.created_at < b.created_at ? 1 : -1);

// ---- brand ----

let brand = {
  name: 'Мария Звёздная',
  contacts: ['@maria.stars', 'maria@example.com'],
  accent: '#E7B75C',
  intro: 'Здравствуйте! Этот разбор подготовлен лично для вас.',
  outro: 'Спасибо, что доверились мне. Пишите, если появятся вопросы.',
  signature: 'Мария',
};
const images = { logo: null, photo: null };

// ---- purchases ----

const PACKS = {
  p10: { credits: 10, amount_minor: 9900 },
  p30: { credits: 30, amount_minor: 24900 },
  p100: { credits: 100, amount_minor: 69000 },
};

const purchases = [
  {
    id: 'pu-1',
    pack: 'p10',
    credits: 10,
    amount_minor: 9900,
    currency: 'EUR',
    status: 'paid',
    created_at: ago(3),
    paid_at: ago(3),
    payAt: null,
  },
  {
    id: 'pu-2',
    pack: 'p10',
    credits: 10,
    amount_minor: 9900,
    currency: 'EUR',
    status: 'failed',
    created_at: ago(9),
    paid_at: null,
    payAt: null,
  },
  {
    id: 'pu-3',
    pack: 'p10',
    credits: 10,
    amount_minor: 9900,
    currency: 'EUR',
    status: 'refunded',
    created_at: ago(40),
    paid_at: ago(40),
    payAt: null,
  },
];

/** A pending purchase is paid once its moment comes, as if Stripe's webhook had arrived. */
function settle() {
  for (const p of purchases) {
    if (p.status === 'pending' && p.payAt !== null && Date.now() >= p.payAt) {
      p.status = 'paid';
      p.paid_at = iso(Date.now());
      seller.balance += p.credits;
    }
  }
}

const purchaseView = ({ payAt, ...p }) => ({
  ...p,
  refundable:
    p.status === 'paid' &&
    p.paid_at !== null &&
    Date.parse(p.paid_at) >= Date.now() - 14 * DAY &&
    seller.balance >= p.credits,
});

// ---- a tiny PDF and a tiny PNG ----

function tinyPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 24 Tf 72 760 Td (Chronika Pro - fake PDF) Tj ET';
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---- HTTP ----

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readRaw = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });

const readJson = async (req) => {
  try {
    const body = JSON.parse((await readRaw(req)).toString('utf8'));
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
};

const ownReading = (id) => readings.find((r) => r.id === id);

/** `ye***@gmail.com`: two characters of the local part (one if shorter), then the domain. */
const mask = (email) => {
  const at = email.lastIndexOf('@');
  return `${email.slice(0, Math.min(2, at))}***@${email.slice(at + 1)}`;
};

async function route(req, res, path) {
  const m = req.method;
  const at = (re) => path.match(re);
  let hit;

  if (m === 'POST' && (path === '/v1/pro/login' || path === '/v1/pro/signup')) {
    await readRaw(req);
    return send(res, 202, { ok: true });
  }
  if (m === 'POST' && path === '/v1/pro/session') {
    await readRaw(req);
    return send(res, 200, {
      session: 'dev',
      account: { email: seller.email, tone: seller.tone },
    });
  }
  // Whose cabinet a link opens: /login/dead is a used link, /login/other one for someone else.
  if (m === 'POST' && path === '/v1/pro/login/peek') {
    const token = String((await readJson(req)).token ?? '');
    if (token === 'dead') return send(res, 404, { error: 'not found' });
    return send(res, 200, { email: mask(token === 'other' ? 'yevhenii@gmail.com' : seller.email) });
  }
  if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) {
    return send(res, 401, { error: 'unauthorized' });
  }
  settle();

  if (m === 'GET' && path === '/v1/pro/me') return send(res, 200, { ...seller });
  if (m === 'POST' && path === '/v1/pro/logout') return send(res, 200, { ok: true });
  if (m === 'POST' && path === '/v1/pro/invite') {
    const code = String((await readJson(req)).code ?? '')
      .trim()
      .toUpperCase();
    if (seller.invite_redeemed) return send(res, 409, { error: 'already redeemed' });
    const credits = Object.hasOwn(INVITES, code) ? INVITES[code] : 0;
    if (!credits) return send(res, 404, { error: 'invalid code' });
    seller.invite_redeemed = true;
    seller.balance += credits;
    return send(res, 200, { credits, balance: seller.balance });
  }

  // clients
  if (path === '/v1/pro/clients') {
    if (m === 'GET') return send(res, 200, { clients: [...clients].sort(newest) });
    if (m === 'POST') {
      const body = await readJson(req);
      if (body.consent !== true) return send(res, 400, { error: 'consent' });
      if (typeof body.name !== 'string' || !body.name.trim() || !body.date) {
        return send(res, 400, { error: 'birth' });
      }
      const id = newId('c');
      clients.push({
        id,
        name: body.name.trim(),
        date: body.date,
        time: body.time ?? null,
        latitude: body.latitude ?? 0,
        longitude: body.longitude ?? 0,
        zone: body.zone ?? 'UTC',
        place: body.place ?? '',
        gender: body.gender ?? 'n',
        created_at: iso(Date.now()),
      });
      return send(res, 201, { id });
    }
  }
  if ((hit = at(/^\/v1\/pro\/clients\/([^/]+)$/))) {
    const index = clients.findIndex((c) => c.id === hit[1]);
    if (index < 0) return send(res, 404, { error: 'not found' });
    if (m === 'GET') {
      const client = clients[index];
      const own = readings.filter(
        (r) => r.client_id === client.id || r.partner_client_id === client.id,
      );
      return send(res, 200, { client, readings: own.sort(newest).map(summary) });
    }
    if (m === 'DELETE') {
      clients.splice(index, 1);
      for (let i = readings.length - 1; i >= 0; i--) {
        if (readings[i].client_id === hit[1] || readings[i].partner_client_id === hit[1]) {
          readings.splice(i, 1);
        }
      }
      return send(res, 200, { ok: true });
    }
  }

  // readings
  if (path === '/v1/pro/readings') {
    if (m === 'GET') return send(res, 200, { readings: [...readings].sort(newest).map(summary) });
    if (m === 'POST') {
      const body = await readJson(req);
      const cost = Object.hasOwn(COST, body.product) ? COST[body.product] : 0;
      if (!cost) return send(res, 400, { error: 'product' });
      if (!clients.some((c) => c.id === body.client_id)) return send(res, 400, { error: 'client' });
      if (body.product === 'synastry') {
        const partner = body.partner_client_id;
        if (partner === body.client_id || !clients.some((c) => c.id === partner)) {
          return send(res, 400, { error: 'partner' });
        }
      }
      if (seller.balance < cost) {
        return send(res, 402, { error: 'insufficient credits', balance: seller.balance });
      }
      seller.balance -= cost;
      const id = newId('r');
      readings.push(
        reading({
          id,
          product: body.product,
          client_id: body.client_id,
          partner_client_id: body.product === 'synastry' ? body.partner_client_id : null,
          status: 'writing',
          written: 0,
          created_at: iso(Date.now()),
        }),
      );
      return send(res, 201, { id });
    }
  }
  if (m === 'GET' && (hit = at(/^\/v1\/pro\/readings\/([^/]+)$/))) {
    const r = ownReading(hit[1]);
    if (!r) return send(res, 404, { error: 'not found' });
    advance(r);
    return send(res, 200, view(r));
  }
  if (m === 'POST' && (hit = at(/^\/v1\/pro\/readings\/([^/]+)\/sections\/([^/]+)\/regenerate$/))) {
    const r = ownReading(hit[1]);
    const planned = r?.plan.find((p) => p.id === hit[2]);
    if (!r || !planned) return send(res, 404, { error: 'not found' });
    if (r.editable_until <= iso(Date.now())) return send(res, 409, { error: 'frozen' });
    if (r.regenerations >= 10) return send(res, 409, { error: 'limit' });
    r.regenerations += 1;
    const section = { ...planned, text: sectionText(planned.title, r.regenerations) };
    r.sections = r.sections.filter((s) => s.id !== planned.id).concat(section);
    r.pdf = 'none';
    r.pages = null;
    // A rewrite takes a moment in the real worker.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return send(res, 200, { section, regenerations_left: 10 - r.regenerations });
  }
  if (m === 'POST' && (hit = at(/^\/v1\/pro\/readings\/([^/]+)\/sections\/([^/]+)\/report$/))) {
    const comment = String((await readJson(req)).comment ?? '').trim();
    if (!ownReading(hit[1])) return send(res, 404, { error: 'not found' });
    if (comment.length < 1 || comment.length > 1000) return send(res, 400, { error: 'comment' });
    console.warn('fake report', hit[1], hit[2], comment);
    return send(res, 201, { ok: true });
  }
  if ((hit = at(/^\/v1\/pro\/readings\/([^/]+)\/pdf$/))) {
    const r = ownReading(hit[1]);
    if (!r) return send(res, 404, { error: 'not found' });
    if (m === 'POST') {
      if (r.status !== 'ready') return send(res, 409, { error: 'not_ready' });
      if (pdfState(r) === 'building') return send(res, 409, { error: 'building' });
      r.pdf = 'building';
      r.pdfReadyAt = Date.now() + 6000;
      return send(res, 202, { ok: true });
    }
    if (m === 'GET') {
      if (pdfState(r) !== 'ready') return send(res, 404, { error: 'not found' });
      const pdf = tinyPdf();
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="chronika-${r.id}.pdf"`,
        'content-length': pdf.length,
        'cache-control': 'private, no-store',
      });
      return res.end(pdf);
    }
  }
  if (m === 'GET' && path === '/v1/pro/demo') {
    const demo = readings.find((r) => r.id === 'r-ready');
    return send(res, 200, { product: 'natal', sections: view(demo).sections });
  }

  // brand
  if (path === '/v1/pro/brand') {
    if (m === 'GET') {
      return send(res, 200, {
        brand: brand && { ...brand, has_logo: !!images.logo, has_photo: !!images.photo },
        tone: seller.tone,
      });
    }
    if (m === 'PUT') {
      const body = await readJson(req);
      if (typeof body.name !== 'string' || !body.name.trim()) return send(res, 400, { error: 'brand' });
      if (body.tone !== undefined && body.tone !== 'vy' && body.tone !== 'ty') {
        return send(res, 400, { error: 'tone' });
      }
      brand = {
        name: body.name,
        contacts: Array.isArray(body.contacts) ? body.contacts : [],
        accent: body.accent ?? '#E7B75C',
        intro: body.intro ?? '',
        outro: body.outro ?? '',
        signature: body.signature ?? '',
      };
      if (body.tone) seller.tone = body.tone;
      return send(res, 200, { ok: true });
    }
  }
  if ((hit = at(/^\/v1\/pro\/brand\/(logo|photo)$/))) {
    const kind = hit[1];
    if (m === 'PUT') {
      const bytes = await readRaw(req);
      if (!brand) return send(res, 409, { error: 'no_brand' });
      if (bytes.length === 0 || bytes.length > 1_048_576) return send(res, 400, { error: 'image' });
      images[kind] = { bytes, type: req.headers['content-type'] ?? 'image/png' };
      return send(res, 200, { ok: true });
    }
    if (m === 'GET') {
      const image = images[kind];
      if (!image) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': image.type, 'cache-control': 'private, no-store' });
      return res.end(image.bytes);
    }
    if (m === 'DELETE') {
      images[kind] = null;
      return send(res, 200, { ok: true });
    }
  }

  // purchases
  if (path === '/v1/pro/purchases') {
    if (m === 'GET') {
      const list = [...purchases].sort(newest).map(purchaseView);
      return send(res, 200, { purchases: list });
    }
    if (m === 'POST') {
      const packId = (await readJson(req)).pack;
      const pack = Object.hasOwn(PACKS, packId) ? PACKS[packId] : null;
      if (!pack) return send(res, 400, { error: 'pack' });
      const id = newId('pu');
      purchases.push({
        id,
        pack: packId,
        credits: pack.credits,
        amount_minor: pack.amount_minor,
        currency: 'EUR',
        status: 'pending',
        created_at: iso(Date.now()),
        paid_at: null,
        // "Paid" a few seconds after the checkout link is followed.
        payAt: Date.now() + 7000,
      });
      return send(res, 201, { id, checkout_url: `/credits?purchase=${id}` });
    }
  }

  return send(res, 404, { error: 'not found' });
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://fake').pathname;
  if (!path.startsWith('/v1/pro/')) return send(res, 404, { error: 'not found' });
  route(req, res, path).catch((error) => {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'fake server error' });
  });
  // Loopback only: the fake answers anyone as a signed-in seller.
}).listen(PORT, '127.0.0.1', () => {
  console.log(`fake pro jobs on http://127.0.0.1:${PORT}/v1/pro/ — visual checks only`);
});
