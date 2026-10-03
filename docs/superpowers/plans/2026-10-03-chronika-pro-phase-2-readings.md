# Chronika Pro — Phase 2: Readings for Sellers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller keeps a base of clients and orders readings for them with credits. They read the result section by section, regenerate sections within limits, and assemble the PDF on demand. A reading that writes nothing returns its credits. Separately, B2C job payloads stop outliving the 30-day retention promise.

**Architecture:**
- A seller's reading is an ordinary `orders` + `jobs` + `charts` row set, plus `pro_readings` (owner, clients, regeneration count, edit window).
- The pipeline (`apps/jobs/src/pipeline.ts`) learns two things about seller orders: stop after the texts, and render the PDF only on request without sending a letter.
- Seller logic lives in `apps/jobs/src/pro/clients.ts`, `readings.ts` and `lifecycle.ts`, exposed through `src/pro/routes.ts`.
- Tests drive the real pipeline against Node-side fakes of the text API and the ephemeris service, wired into Miniflare as service bindings.

**Tech Stack:** Cloudflare Workers, D1, R2, Queues, TypeScript strict, Vitest + `@cloudflare/vitest-plugin` 1.3.x (Miniflare).

**Spec:** `docs/chronika-pro/SPEC.md` (Product, Data, Architecture; Roadmap row 2) plus the Phase 2 decisions below. They are not in the spec yet; Task 10 writes them there.

## Global Constraints

- No auth libraries, no ORM, no Redis. Plain SQL via `D1Database`. Timestamps are ISO-8601 UTC strings (`now()`). Ids are `crypto.randomUUID()`. Enum-like columns are TEXT + CHECK.
- Credits: **bundle = 2, every other product = 1** (`CREDIT_COST` in `src/pro/credits.ts`). They are spent when the reading is created, before any generation.
- **Refunds:** a full automatic refund happens **only when nothing was written** (calculation failed, or not one section). If some sections exist, the reading is delivered and the missing sections are regenerated **free**, without counting toward the limit.
- **Regeneration:** **10 paid regenerations per reading**, within **14 days** of creation. After that the reading is frozen. Missing sections can always be filled.
- **Retention:**
  - Seller readings keep their texts (`jobs.payload`) and charts for as long as the client exists; charts get `expires_at = '9999-12-31T23:59:59.999Z'`.
  - Seller PDFs live 30 days like B2C (`RETENTION_DAYS`) and are re-assembled on demand.
  - B2C job payloads are cleared once the order is past `RETENTION_DAYS`.
- **Synastry partner is a client too.** Deleting a client deletes every reading they are in (as client or partner): orders, jobs, charts, documents and R2 objects. Ledger rows stay; they hold no personal data.
- **Demo:** one pre-generated reading, named by the optional var `PRO_DEMO_ORDER_ID`, is readable by every signed-in seller.
- **Pilot language** for seller readings is `ru`.
- Every `/v1/pro/*` call carries `x-pro-key` (Phase 1); routes added here sit behind the same check and a session.
- Commit messages are English outcome sentences ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `.devcontainer/docker-compose.yml`, `.gitignore`, `AGENTS.md` or `apps/jobs/.wrangler/`.
- Never run remote wrangler commands (migrations, secrets, deploys).
- pnpm is not on PATH: use `corepack pnpm`. To run one test file: `corepack pnpm --filter @natalka/jobs exec vitest run test/<file>`. Full suite: `corepack pnpm --filter @natalka/jobs test`. Types: `corepack pnpm --filter @natalka/jobs exec tsc --noEmit`.

## Review Focus

1. **Two taps on "create reading" with one credit left.** Expected: one reading, one spend, balance 0. The second call gets `insufficient`. → Task 5 test.
2. **Two regenerations of one reading at once.** Expected: no written text is lost. The loser gets `busy`, and its reserved regeneration is given back. → Task 7 test.
3. **Seller B guessing seller A's client or reading id.** Expected: 404, never data. → Task 4, Task 5 and Task 9 tests.
4. **Deleting a client who is the partner in someone's synastry.** Expected: that synastry, its documents and its R2 objects go too. Other clients' readings stay. → Task 5 test.
5. **The queue redelivers a message after the job was settled.** Expected: credits are refunded once, never twice. → Task 6 test.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/jobs/migrations/0009_pro_readings.sql` | `orders.pro_account_id`, `pro_clients`, `pro_readings` |
| `apps/jobs/test/fakes.ts` | Node-side fake text API and ephemeris, with failure arming |
| `apps/jobs/test/seed.ts` | Insert a ready-to-run order directly (B2C or seller); `readingFor` (Task 6) |
| `apps/jobs/test/people.ts` | Shared client fixture `ANNA` (Task 4) |
| `apps/jobs/src/pipeline.ts` | + seller branch, `loadPeople`, `writeSection`, `dropDocuments` exports |
| `apps/jobs/src/db.ts` | + `scrubExpiredJobPayloads` |
| `apps/jobs/src/pro/clients.ts` | Validate, create, list and read clients |
| `apps/jobs/src/pro/readings.ts` | Create a reading, read it, list readings, delete a client with their readings |
| `apps/jobs/src/pro/lifecycle.ts` | Settle a failed job, regenerate a section, assemble the PDF, fetch the PDF |
| `apps/jobs/src/pro/routes.ts` | + client and reading routes, demo |
| `apps/jobs/src/index.ts` | Queue: settle a seller's job on the last delivery; sweep: scrub B2C payloads |
| `apps/jobs/src/env.ts` | + `PRO_DEMO_ORDER_ID?` |
| `docs/chronika-pro/SPEC.md` | Phase 2 decisions and the demo operations step |

---

### Task 1: Migration `0009_pro_readings.sql`

**Files:**
- Create: `apps/jobs/migrations/0009_pro_readings.sql`
- Test: `apps/jobs/test/schema-readings.test.ts`

**Interfaces:**
- Produces:
  - `orders.pro_account_id TEXT NULL REFERENCES pro_accounts(id)`
  - `pro_clients(id, account_id, birth_ciphertext, birth_nonce, consent_at, created_at)`
  - `pro_readings(order_id PK → orders ON DELETE CASCADE, account_id, job_id, client_id → pro_clients, partner_client_id → pro_clients NULL, regenerations DEFAULT 0, editable_until, refunded_at, created_at)`

- [ ] **Step 1: Write the failing test**

`apps/jobs/test/schema-readings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const ts = '2026-10-03T00:00:00.000Z';

async function sellerWithClient(name: string) {
  const { account } = await signIn(`${name}@schema2.test`);
  const clientId = crypto.randomUUID();
  await db()
    .prepare(
      'INSERT INTO pro_clients (id, account_id, birth_ciphertext, birth_nonce, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(clientId, account.id, new Uint8Array([1]), new Uint8Array([2]), ts, ts)
    .run();
  const orderId = crypto.randomUUID();
  await db()
    .prepare(
      `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at)
       VALUES (?, ?, 'natal', 'ru', 1, 'credit', 'paid', ?, ?)`,
    )
    .bind(orderId, account.email, account.id, ts)
    .run();
  await db()
    .prepare(
      `INSERT INTO pro_readings (order_id, account_id, job_id, client_id, editable_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(orderId, account.id, crypto.randomUUID(), clientId, ts, ts)
    .run();
  return { accountId: account.id, clientId, orderId };
}

describe('0009 pro readings schema', () => {
  it('lets a B2C order carry no seller', async () => {
    await db()
      .prepare(
        `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, created_at)
         VALUES (?, 'b2c@schema2.test', 'natal', 'ru', 1900, 'EUR', 'pending', ?)`,
      )
      .bind(crypto.randomUUID(), ts)
      .run();
  });

  it('refuses an order for a seller who does not exist', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at)
           VALUES (?, 'x@schema2.test', 'natal', 'ru', 1, 'credit', 'paid', 'nobody', ?)`,
        )
        .bind(crypto.randomUUID(), ts)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('starts a reading with no regenerations used', async () => {
    const { orderId } = await sellerWithClient('fresh');
    const row = await db()
      .prepare('SELECT regenerations, refunded_at, partner_client_id FROM pro_readings WHERE order_id = ?')
      .bind(orderId)
      .first();
    expect(row).toEqual({ regenerations: 0, refunded_at: null, partner_client_id: null });
  });

  it('removes the reading with its order, and only then lets the client go', async () => {
    const { clientId, orderId } = await sellerWithClient('cascade');
    await expect(db().prepare('DELETE FROM pro_clients WHERE id = ?').bind(clientId).run()).rejects.toThrow(
      /FOREIGN KEY/,
    );
    await db().prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
    const left = await db().prepare('SELECT COUNT(*) AS n FROM pro_readings WHERE order_id = ?').bind(orderId).first();
    expect(left).toEqual({ n: 0 });
    await db().prepare('DELETE FROM pro_clients WHERE id = ?').bind(clientId).run();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `corepack pnpm --filter @natalka/jobs exec vitest run test/schema-readings.test.ts`
Expected: FAIL, "no such column: pro_account_id" or "no such table: pro_clients".

- [ ] **Step 3: Write the migration**

`apps/jobs/migrations/0009_pro_readings.sql`:

```sql
-- Chronika Pro, phase 2: a seller's clients and the readings written for them.
--
-- A reading is an ordinary order with its job, charts and documents (the pipeline does not care
-- who asked) plus a pro_readings row: whose it is, which clients it is about, and how much
-- rewriting is left. A seller pays in credits, not money: such an order is status 'paid',
-- currency 'credit', amount_minor = credits spent.

ALTER TABLE orders ADD COLUMN pro_account_id TEXT REFERENCES pro_accounts(id);
CREATE INDEX orders_pro_account ON orders (pro_account_id) WHERE pro_account_id IS NOT NULL;

-- A seller's client. Everything personal (name, date, time, place, coordinates, zone, gender)
-- is in the ciphertext. Kept while the seller's account lives, until the seller deletes it.
CREATE TABLE pro_clients (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES pro_accounts(id),
  birth_ciphertext BLOB NOT NULL,
  birth_nonce      BLOB NOT NULL,
  -- When the seller confirmed they have this client's consent.
  consent_at       TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX pro_clients_account ON pro_clients (account_id, created_at);

CREATE TABLE pro_readings (
  order_id          TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  account_id        TEXT NOT NULL REFERENCES pro_accounts(id),
  job_id            TEXT NOT NULL,
  client_id         TEXT NOT NULL REFERENCES pro_clients(id),
  -- The second person of a synastry; NULL for every other product.
  partner_client_id TEXT REFERENCES pro_clients(id),
  -- Paid rewrites used. A section that failed to be written is filled without counting.
  regenerations     INTEGER NOT NULL DEFAULT 0,
  -- After this the reading is frozen: nothing more is rewritten.
  editable_until    TEXT NOT NULL,
  -- Set when nothing could be written and the credits went back.
  refunded_at       TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX pro_readings_account ON pro_readings (account_id, created_at);
CREATE INDEX pro_readings_client ON pro_readings (client_id);
CREATE INDEX pro_readings_partner ON pro_readings (partner_client_id) WHERE partner_client_id IS NOT NULL;
```

- [ ] **Step 4: Run to see it pass, then the full suite**

Run the file: expect 4 passed. Run the full suite: expect everything green (Phase 1 tests untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/migrations/0009_pro_readings.sql apps/jobs/test/schema-readings.test.ts
git commit -m "A place for a seller's clients and the readings written for them"
```

---

### Task 2: Test doubles, and the pipeline's seller branch

**Files:**
- Create: `apps/jobs/test/fakes.ts`, `apps/jobs/test/seed.ts`, `apps/jobs/test/pipeline.test.ts`
- Modify: `apps/jobs/vitest.config.ts`, `apps/jobs/test/env.ts`, `apps/jobs/src/pipeline.ts`

**Interfaces:**
- Produces (pipeline.ts exports):
  - `type People = { first: BirthData; second: BirthData | null }`
  - `loadPeople(env: Env, job: Pick<JobRow, 'order_id' | 'kind'>): Promise<People>`
  - `type SectionPlan`, `type WrittenSection` (now exported)
  - `writeSection(env: Env, kind: Product, people: People, payload: JobPayload, sectionId: string, others: WrittenSection[]): Promise<WrittenSection>`, which throws on any API error
  - `dropDocuments(env: Env, orderId: string): Promise<void>`, which deletes R2 objects and `documents` rows of an order
  - `proAccountOf(db: D1Database, orderId: string): Promise<string | null>`
- Produces (tests):
  - `test/fakes.ts`: `fakeApi`, `fakeEphemeris`, `FAKE_PLAN` (sections `a`, `b`, `c`)
  - `test/env.ts`: `armFailure(key: string, times?: number)` and `runJob(jobId: string): Promise<boolean>`
  - `test/seed.ts`: `seedOrder(opts): Promise<{ orderId; jobId; accountId }>`
- Behaviour:
  - A seller job goes `calc → texts → done` (no PDF, no letter).
  - A seller job put at step `pdf` renders, replaces any earlier PDF of that order, and goes to `done` without a letter.
  - B2C is unchanged.

Failure-arming keys used by the fakes:
- `"<name>|<section_id>"`: that section fails for the client with that name.
- `"<name>|*"`: every section fails.
- `"<name>|pdf"`: the skeleton fails.

Each arm fails the next `times` matching calls. A birth date of `1900-01-01` always fails the calculation.

- [ ] **Step 1: Write the fakes**

`apps/jobs/test/fakes.ts`:

```ts
/** Stand-ins for the Python text API and the ephemeris service, bound into the worker under test
 * as service bindings. They run in Node, outside the worker. A test arms a failure by POSTing
 * { key, times } to /__fail on the API binding; keys name the client, so tests running side by
 * side never trip each other. A birth date of 1900-01-01 always fails the calculation. */

export const FAKE_PLAN = [
  { id: 'a', title: 'Первая', quote: false },
  { id: 'b', title: 'Вторая', quote: true },
  { id: 'c', title: 'Третья', quote: false },
];

const armed = new Map<string, number>();

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
  if (path === '/v1/sections') return json({ sections: FAKE_PLAN });
  if (path === '/v1/section') {
    const body = (await request.json()) as { section_id: string; name: string };
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
    const body = (await request.json()) as { name: string };
    if (trips(`${body.name}|pdf`)) return new Response('render down', { status: 500 });
    return json({ document: true });
  }
  if (path === '/v1/document') {
    return new Response(new Uint8Array([37, 80, 68, 70]), {
      headers: { 'content-type': 'application/pdf', 'x-pages': '7' },
    });
  }
  return new Response('not found', { status: 404 });
}
```

- [ ] **Step 2: Bind them**

In `apps/jobs/vitest.config.ts`, add `import { fakeApi, fakeEphemeris } from './test/fakes';` and inside `miniflare` (next to `bindings`):

```ts
        // The text API and the ephemeris service, faked in Node (see test/fakes.ts).
        serviceBindings: { API: fakeApi, EPHEMERIS: fakeEphemeris },
```

If the installed plugin version does not accept function service bindings, read its README in `node_modules/@cloudflare/vitest-plugin`. The goal stays the same: `env.API.fetch` and `env.EPHEMERIS.fetch` reach these functions. If that is impossible, report BLOCKED.

- [ ] **Step 3: Test helpers**

Append to `apps/jobs/test/env.ts` (imports at the top):

```ts
import { getJob } from '../src/db';
import { advance } from '../src/pipeline';

/** Makes the fake text API fail the next `times` calls matching `key` (see test/fakes.ts). */
export async function armFailure(key: string, times = 1000): Promise<void> {
  await testEnv.API.fetch('https://api.test/__fail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, times }),
  });
}

/** One pipeline pass over a job, with a generous budget. */
export async function runJob(jobId: string): Promise<boolean> {
  const job = await getJob(testEnv.DB, jobId);
  if (!job) throw new Error(`no job ${jobId}`);
  return advance(testEnv, job, Date.now() + 60_000);
}
```

`apps/jobs/test/seed.ts`:

```ts
import { encryptJson } from '../src/crypto';
import { insertChart, insertJob, type Product } from '../src/db';
import { signIn, testEnv } from './env';

/** An order with one chart and a queued job, inserted directly, B2C or a seller's. */
export async function seedOrder(opts: {
  pro: boolean;
  name: string;
  product?: Product;
  date?: string;
  createdAt?: string;
}): Promise<{ orderId: string; jobId: string; accountId: string | null }> {
  const orderId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const product = opts.product ?? 'natal';
  const accountId = opts.pro ? (await signIn(`seed-${orderId}@seed.test`)).account.id : null;
  await testEnv.DB.prepare(
    `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status, pro_account_id, created_at)
     VALUES (?, 'buyer@seed.test', ?, 'ru', 0, 'EUR', 'test', ?, ?)`,
  )
    .bind(orderId, product, accountId, opts.createdAt ?? new Date().toISOString())
    .run();
  const { ciphertext, nonce } = await encryptJson(
    {
      date: opts.date ?? '1994-05-15',
      time: '15:25',
      latitude: 45.2,
      longitude: 33.36,
      zone: 'Europe/Simferopol',
      place: 'Евпатория',
      name: opts.name,
      gender: 'f',
      lang: 'ru',
    },
    testEnv.DATA_KEY,
  );
  await insertChart(testEnv.DB, {
    id: crypto.randomUUID(),
    order_id: orderId,
    ciphertext,
    nonce,
    unknown_time: false,
    gender: 'f',
    display_name: opts.name,
    place_label: 'Евпатория',
    expires_at: '9999-12-31T23:59:59.999Z',
  });
  await insertJob(testEnv.DB, { id: jobId, order_id: orderId, kind: product });
  return { orderId, jobId, accountId };
}
```

- [ ] **Step 4: Write the failing pipeline tests**

`apps/jobs/test/pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { dropDocuments } from '../src/pipeline';
import { armFailure, runJob, testEnv } from './env';
import { seedOrder } from './seed';

const count = async (sql: string, ...args: unknown[]) =>
  ((await testEnv.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0);

describe('pipeline', () => {
  it('takes a shopper all the way to the letter, as before', async () => {
    const { orderId, jobId } = await seedOrder({ pro: false, name: 'Покупатель' });
    expect(await runJob(jobId)).toBe(true);
    const job = await getJob(testEnv.DB, jobId);
    expect(job?.step).toBe('done');
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM email_events WHERE order_id = ?', orderId)).toBe(1);
  });

  it("stops a seller's reading after the texts: no PDF, no letter", async () => {
    const { orderId, jobId } = await seedOrder({ pro: true, name: 'Клиентка' });
    expect(await runJob(jobId)).toBe(true);
    const job = await getJob(testEnv.DB, jobId);
    expect(job).toMatchObject({ step: 'done', status: 'done' });
    expect(JSON.parse(job?.payload ?? '{}').sections.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c']);
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM email_events WHERE order_id = ?', orderId)).toBe(0);
  });

  it("assembles a seller's PDF on request, replacing the previous one, without a letter", async () => {
    const { orderId, jobId } = await seedOrder({ pro: true, name: 'Сборка' });
    await runJob(jobId);
    for (let round = 0; round < 2; round++) {
      await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
      expect(await runJob(jobId)).toBe(true);
    }
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('done');
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM email_events WHERE order_id = ?', orderId)).toBe(0);
    const doc = await testEnv.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ?')
      .bind(orderId)
      .first<{ storage_key: string }>();
    expect(await testEnv.DOCS.get(doc?.storage_key ?? '')).not.toBeNull();
  });

  it('keeps what was written when a section fails, for the retry to resume', async () => {
    const { jobId } = await seedOrder({ pro: true, name: 'Сбой' });
    await armFailure('Сбой|b', 1);
    await expect(runJob(jobId)).rejects.toThrow(/503/);
    const written = JSON.parse((await getJob(testEnv.DB, jobId))?.payload ?? '{}').sections;
    expect(written.map((s: { id: string }) => s.id)).toEqual(['a']);
    expect(await runJob(jobId)).toBe(true);
  });

  it('drops every document of an order, objects first', async () => {
    const { orderId, jobId } = await seedOrder({ pro: true, name: 'Удаление' });
    await runJob(jobId);
    await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
    await runJob(jobId);
    const key = (
      await testEnv.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ?')
        .bind(orderId)
        .first<{ storage_key: string }>()
    )?.storage_key as string;
    await dropDocuments(testEnv, orderId);
    expect(await testEnv.DOCS.get(key)).toBeNull();
    expect(await count('SELECT COUNT(*) AS n FROM documents WHERE order_id = ?', orderId)).toBe(0);
  });
});
```

- [ ] **Step 5: Run to see it fail**

Run: `corepack pnpm --filter @natalka/jobs exec vitest run test/pipeline.test.ts`
Expected: FAIL. The seller tests fail (they get a PDF and a letter) and `dropDocuments` is not exported. The B2C test should already pass. If it does not, the fakes are wrong: fix them first.

- [ ] **Step 6: Implement in `apps/jobs/src/pipeline.ts`**

1. Export the types: change `interface SectionPlan` to `export interface SectionPlan`, `interface WrittenSection` to `export interface WrittenSection`, and `interface People` to `export interface People`.

2. Add `type Product` to the `./db` import, plus these helpers after `loadBirth`:

```ts
/** Whose order this is: a shopper's (null) or a seller's account. */
export async function proAccountOf(db: D1Database, orderId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT pro_account_id FROM orders WHERE id = ?')
    .bind(orderId)
    .first<{ pro_account_id: string | null }>();
  return row?.pro_account_id ?? null;
}

/** The people a job is about, decrypted. */
export async function loadPeople(env: Env, job: Pick<JobRow, 'order_id' | 'kind'>): Promise<People> {
  return {
    first: await loadBirth(env, job.order_id),
    second: job.kind === 'synastry' ? await loadBirth(env, job.order_id, 2) : null,
  };
}

/** Removes an order's PDFs: the objects first, then the rows that point at them. A seller's PDF
 * is replaced when it is assembled again and goes stale when a section is rewritten. */
export async function dropDocuments(env: Env, orderId: string): Promise<void> {
  const { results } = await env.DB.prepare('SELECT storage_key FROM documents WHERE order_id = ?')
    .bind(orderId)
    .all<{ storage_key: string }>();
  for (const row of results) await env.DOCS.delete(row.storage_key);
  await env.DB.prepare('DELETE FROM documents WHERE order_id = ?').bind(orderId).run();
}
```

3. Extract the single-section call out of `writeSections` and export it:

```ts
/** Writes one section, with the others as context. Throws on any API error. */
export async function writeSection(
  env: Env,
  kind: Product,
  people: People,
  payload: JobPayload,
  sectionId: string,
  others: WrittenSection[],
): Promise<WrittenSection> {
  const { first: birth, second } = people;
  return api<WrittenSection>(env, '/v1/section', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      facts: payload.facts,
      transits: payload.transits ?? [],
      section_id: sectionId,
      product: kind,
      lang: birth.lang,
      name: birth.name,
      gender: birth.gender,
      second_name: second?.name ?? '',
      written_so_far: others.map((s) => `${s.title}: ${s.text.slice(0, 160)}…`),
    }),
  });
}
```

Inside `writeSections`, replace the inline `api<WrittenSection>(env, '/v1/section', {...})` call with `writeSection(env, job.kind, people, payload, entry.id, sections)`. Keep the surrounding `try/catch` exactly as it is.

4. In `advance()`, replace the two `loadBirth` lines with `const people = await loadPeople(env, job);`, then add `const seller = await proAccountOf(env.DB, job.order_id);` and change the step transitions:

```ts
  if (job.step === 'texts') {
    const result = await writeSections(env, job, people, payload, deadline);
    payload = result.payload;
    if (!result.done) {
      await updateJob(env.DB, job.id, { payload: JSON.stringify(payload) });
      return false;
    }
    if (seller) {
      // A seller reads the texts first and asks for the PDF when they are happy with them.
      await updateJob(env.DB, job.id, { step: 'done', status: 'done', payload: JSON.stringify(payload) });
      return true;
    }
    await updateJob(env.DB, job.id, { step: 'pdf', payload: JSON.stringify(payload) });
    job = { ...job, step: 'pdf' };
  }

  if (job.step === 'pdf') {
    if (seller) {
      await dropDocuments(env, job.order_id);
      await render(env, job, people, payload);
      // The seller delivers the reading themselves: no letter, no bot.
      await updateJob(env.DB, job.id, { step: 'done', status: 'done' });
      return true;
    }
    await render(env, job, people, payload);
    await updateJob(env.DB, job.id, { step: 'email' });
    job = { ...job, step: 'email' };
  }
```

Leave the `calc` and `email` blocks unchanged.

- [ ] **Step 7: Run to see it pass, then the full suite and tsc**

Expected: the pipeline file has 5 passed, the full suite is green and tsc is clean.

- [ ] **Step 8: Commit**

```bash
git add apps/jobs/test/fakes.ts apps/jobs/test/seed.ts apps/jobs/test/pipeline.test.ts apps/jobs/test/env.ts apps/jobs/vitest.config.ts apps/jobs/src/pipeline.ts
git commit -m "Stop a seller's reading at the texts, and assemble its PDF only when asked"
```

---

### Task 3: Shoppers' job payloads expire with everything else (B2C fix)

**Files:**
- Modify: `apps/jobs/src/db.ts`, `apps/jobs/src/index.ts`
- Test: `apps/jobs/test/retention.test.ts`

**Interfaces:**
- Consumes: `seedOrder` (Task 2), `orders.pro_account_id` (Task 1).
- Produces: `scrubExpiredJobPayloads(db: D1Database, days: number): Promise<number>`, which returns the number of jobs cleared.

Why: `jobs.payload` holds the calculated chart (birth date, time and place) and every text written from it. Nothing ever deletes it, which contradicts the ready letter's promise that the document and the birth data are deleted after thirty days.

- [ ] **Step 1: Write the failing test**

`apps/jobs/test/retention.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scrubExpiredJobPayloads } from '../src/db';
import { testEnv } from './env';
import { seedOrder } from './seed';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const payloadOf = async (jobId: string) =>
  (
    await testEnv.DB.prepare('SELECT payload FROM jobs WHERE id = ?').bind(jobId).first<{ payload: string | null }>()
  )?.payload ?? null;

async function withPayload(opts: { pro: boolean; age: number; name: string }) {
  const seeded = await seedOrder({ pro: opts.pro, name: opts.name, createdAt: daysAgo(opts.age) });
  await testEnv.DB.prepare("UPDATE jobs SET payload = '{\"facts\":{\"birth\":{\"date\":\"1994-05-15\"}}}' WHERE id = ?")
    .bind(seeded.jobId)
    .run();
  return seeded;
}

describe('retention of job payloads', () => {
  it("clears a shopper's payload past the retention date and keeps everything else", async () => {
    const old = await withPayload({ pro: false, age: 31, name: 'Старый' });
    const recent = await withPayload({ pro: false, age: 29, name: 'Свежий' });
    const seller = await withPayload({ pro: true, age: 400, name: 'Продавец' });

    expect(await scrubExpiredJobPayloads(testEnv.DB, 30)).toBeGreaterThanOrEqual(1);

    expect(await payloadOf(old.jobId)).toBeNull();
    expect(await payloadOf(recent.jobId)).not.toBeNull();
    expect(await payloadOf(seller.jobId)).not.toBeNull();
  });

  it('keeps the order row and the cost of the job', async () => {
    const old = await withPayload({ pro: false, age: 45, name: 'Учёт' });
    await testEnv.DB.prepare('UPDATE jobs SET cost_micros = 4242 WHERE id = ?').bind(old.jobId).run();
    await scrubExpiredJobPayloads(testEnv.DB, 30);
    const row = await testEnv.DB.prepare(
      'SELECT o.id AS order_id, j.cost_micros FROM jobs j JOIN orders o ON o.id = j.order_id WHERE j.id = ?',
    )
      .bind(old.jobId)
      .first();
    expect(row).toEqual({ order_id: old.orderId, cost_micros: 4242 });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Expected: FAIL, `scrubExpiredJobPayloads` is not exported.

- [ ] **Step 3: Implement**

In `apps/jobs/src/db.ts`, after `expired`:

```ts
/** A shopper's job keeps the calculated chart (birth date, time and place) and every text written
 * from it. Past the retention date both go, like the charts and the PDF; the order and the cost
 * stay for accounting. A seller's reading is kept on purpose: it belongs to their client base. */
export async function scrubExpiredJobPayloads(db: D1Database, days: number): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE jobs SET payload = NULL
       WHERE payload IS NOT NULL
         AND order_id IN (SELECT id FROM orders WHERE pro_account_id IS NULL AND created_at < ?)`,
    )
    .bind(expiryFrom(-days))
    .run();
  return result.meta.changes ?? 0;
}
```

In `apps/jobs/src/index.ts`, import `scrubExpiredJobPayloads` from `./db`. In `scheduled()`'s nightly branch, add this right after `await dropExpiredBirths(env.DB);`:

```ts
    const scrubbed = await scrubExpiredJobPayloads(env.DB, Number(env.RETENTION_DAYS ?? '30'));
```

Then extend the closing log line to `` `retention: removed ${stale.results?.length ?? 0} documents, cleared ${scrubbed} job payloads` ``.

- [ ] **Step 4: Run to see it pass; full suite; tsc**

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/db.ts apps/jobs/src/index.ts apps/jobs/test/retention.test.ts
git commit -m "Forget a shopper's chart and texts when the thirty days are up, as the letter promises"
```

---

### Task 4: Clients (`src/pro/clients.ts`)

**Files:**
- Create: `apps/jobs/src/pro/clients.ts`
- Test: `apps/jobs/test/clients.test.ts`

**Interfaces:**
- Consumes: `encryptJson`, `decryptJson`, `type Blobish` from `src/crypto.ts`; `now` from `src/db.ts`.
- Produces:
  - `interface ClientBirth { name: string; date: string; time: string | null; latitude: number; longitude: number; zone: string; place: string; gender: 'f' | 'm' | 'n' }`
  - `interface ClientView extends ClientBirth { id: string; created_at: string }`
  - `parseClientBirth(raw: unknown): ClientBirth | null`
  - `createClient(env: Env, accountId: string, birth: ClientBirth): Promise<string>` (the caller has already checked consent)
  - `listClients(env: Env, accountId: string): Promise<ClientView[]>`, newest first
  - `getClient(env: Env, accountId: string, clientId: string): Promise<ClientView | null>`, which is null when the client is someone else's

- [ ] **Step 1: Write the shared fixture and the failing tests**

`apps/jobs/test/people.ts` (a fixture module, not a test file — test files never import each other, or their tests run twice):

```ts
import type { ClientBirth } from '../src/pro/clients';

export const ANNA: ClientBirth = {
  name: 'Анна',
  date: '1994-05-15',
  time: '15:25',
  latitude: 45.2,
  longitude: 33.36,
  zone: 'Europe/Simferopol',
  place: 'Евпатория',
  gender: 'f',
};
```

`apps/jobs/test/clients.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createClient, getClient, listClients, parseClientBirth } from '../src/pro/clients';
import { signIn, testEnv } from './env';
import { ANNA } from './people';

describe('parseClientBirth', () => {
  it('accepts a complete birth and trims text', () => {
    expect(parseClientBirth({ ...ANNA, name: '  Анна ', extra: 1 })).toEqual(ANNA);
  });

  it('accepts an unknown time as null', () => {
    expect(parseClientBirth({ ...ANNA, time: null })?.time).toBeNull();
  });

  it('rejects what is malformed or missing', () => {
    const bad: Record<string, unknown>[] = [
      { ...ANNA, name: '' },
      { ...ANNA, name: 'x'.repeat(81) },
      { ...ANNA, date: '15.05.1994' },
      { ...ANNA, date: '1994-02-30' },
      { ...ANNA, time: '25:00' },
      { ...ANNA, time: undefined },
      { ...ANNA, latitude: 91 },
      { ...ANNA, longitude: '33' },
      { ...ANNA, zone: '' },
      { ...ANNA, place: '' },
      { ...ANNA, gender: 'x' },
    ];
    for (const value of bad) expect(parseClientBirth(value)).toBeNull();
    expect(parseClientBirth(null)).toBeNull();
    expect(parseClientBirth('Анна')).toBeNull();
  });
});

describe('clients', () => {
  it('stores nothing personal in the clear', async () => {
    const { account } = await signIn('cipher@clients.test');
    const id = await createClient(testEnv, account.id, ANNA);
    const row = await testEnv.DB.prepare('SELECT * FROM pro_clients WHERE id = ?').bind(id).first();
    expect(JSON.stringify(row)).not.toContain('Евпатория');
    expect(JSON.stringify(row)).not.toContain('1994-05-15');
  });

  it("returns a seller's own clients, newest first, decrypted", async () => {
    const { account } = await signIn('list@clients.test');
    await createClient(testEnv, account.id, ANNA);
    await createClient(testEnv, account.id, { ...ANNA, name: 'Борис', gender: 'm' });
    const clients = await listClients(testEnv, account.id);
    expect(clients.map((c) => c.name)).toEqual(['Борис', 'Анна']);
    expect(clients[1]).toMatchObject(ANNA);
  });

  it("never shows one seller another seller's client", async () => {
    const owner = await signIn('owner@clients.test');
    const stranger = await signIn('stranger@clients.test');
    const id = await createClient(testEnv, owner.account.id, ANNA);
    expect(await getClient(testEnv, stranger.account.id, id)).toBeNull();
    expect(await listClients(testEnv, stranger.account.id)).toEqual([]);
    expect((await getClient(testEnv, owner.account.id, id))?.name).toBe('Анна');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Expected: FAIL, "Cannot find module '../src/pro/clients'".

- [ ] **Step 3: Implement**

`apps/jobs/src/pro/clients.ts`:

```ts
/** A seller's clients: the people their readings are about.
 *
 * Everything that identifies a client is encrypted the way a shopper's chart is; the table holds
 * ciphertext, the owner and two dates. A list decrypts each row; a seller has tens of clients, not
 * thousands, and nothing is searchable in the clear by design.
 */

import { type Blobish, decryptJson, encryptJson } from '../crypto';
import { now } from '../db';
import type { Env } from '../env';

export interface ClientBirth {
  name: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string;
  place: string;
  gender: 'f' | 'm' | 'n';
}

export interface ClientView extends ClientBirth {
  id: string;
  created_at: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
};

const realDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};

const within = (value: unknown, limit: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;

/** A client's birth from untrusted input, or null when any part is missing or malformed. The time
 * is null when unknown — said explicitly, never by leaving it out. */
export function parseClientBirth(raw: unknown): ClientBirth | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const name = text(b.name, 80);
  const place = text(b.place, 200);
  const zone = text(b.zone, 64);
  const date = realDate(b.date);
  const time = b.time === null ? null : typeof b.time === 'string' && TIME.test(b.time) ? b.time : undefined;
  const latitude = within(b.latitude, 90);
  const longitude = within(b.longitude, 180);
  const gender = b.gender === 'f' || b.gender === 'm' || b.gender === 'n' ? b.gender : null;
  if (!name || !place || !zone || !date || time === undefined) return null;
  if (latitude === null || longitude === null || !gender) return null;
  return { name, date, time, latitude, longitude, zone, place, gender };
}

export async function createClient(env: Env, accountId: string, birth: ClientBirth): Promise<string> {
  const id = crypto.randomUUID();
  const ts = now();
  const { ciphertext, nonce } = await encryptJson(birth, env.DATA_KEY);
  await env.DB.prepare(
    `INSERT INTO pro_clients (id, account_id, birth_ciphertext, birth_nonce, consent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, accountId, ciphertext, nonce, ts, ts)
    .run();
  return id;
}

interface ClientRow {
  id: string;
  birth_ciphertext: Blobish;
  birth_nonce: Blobish;
  created_at: string;
}

const view = async (env: Env, row: ClientRow): Promise<ClientView> => ({
  ...(await decryptJson<ClientBirth>(row.birth_ciphertext, row.birth_nonce, env.DATA_KEY)),
  id: row.id,
  created_at: row.created_at,
});

export async function listClients(env: Env, accountId: string): Promise<ClientView[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, birth_ciphertext, birth_nonce, created_at FROM pro_clients
     WHERE account_id = ? ORDER BY created_at DESC, rowid DESC`,
  )
    .bind(accountId)
    .all<ClientRow>();
  return Promise.all(results.map((row) => view(env, row)));
}

export async function getClient(env: Env, accountId: string, clientId: string): Promise<ClientView | null> {
  const row = await env.DB.prepare(
    'SELECT id, birth_ciphertext, birth_nonce, created_at FROM pro_clients WHERE id = ? AND account_id = ?',
  )
    .bind(clientId, accountId)
    .first<ClientRow>();
  return row ? view(env, row) : null;
}
```

- [ ] **Step 4: Run to see it pass; full suite; tsc**

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/pro/clients.ts apps/jobs/test/clients.test.ts apps/jobs/test/people.ts
git commit -m "A seller's clients, kept encrypted and shown only to them"
```

---

### Task 5: Readings: create, read, list, and delete a client with their readings (`src/pro/readings.ts`)

**Files:**
- Create: `apps/jobs/src/pro/readings.ts`
- Test: `apps/jobs/test/readings.test.ts`

**Interfaces:**
- Consumes:
  - `spend`, `refund`, `balance`, `CREDIT_COST` (Phase 1);
  - `getClient`, `ClientBirth` (Task 4);
  - `dropDocuments`, `JobPayload` (Task 2);
  - `encryptJson`, `now`, `expiryFrom`, `documentForOrder`, `type Product`, `type JobStep`, `type JobStatus`.
- Produces:
  - constants `PRO_LANG = 'ru'`, `REGENERATIONS_PER_READING = 10`, `EDITABLE_DAYS = 14`, `KEEP_FOREVER = '9999-12-31T23:59:59.999Z'`
  - `type CreateReadingResult = { status: 'created'; id: string } | { status: 'insufficient'; balance: number } | { status: 'invalid'; error: string }`
  - `createReading(env: Env, account: { id: string; email: string }, input: { product?: unknown; client_id?: unknown; partner_client_id?: unknown }): Promise<CreateReadingResult>`
  - `interface ReadingRow` and `readingRow(db: D1Database, orderId: string, accountId: string | null): Promise<ReadingRow | null>` (`accountId` null = no owner check, used only for the demo)
  - `type ReadingStatus = 'writing' | 'ready' | 'failed'`
  - `readingStatus(row: ReadingRow): ReadingStatus`
  - `interface ReadingView` and `readingView(env: Env, row: ReadingRow): Promise<ReadingView>`
  - `listReadings(env: Env, accountId: string, clientId?: string): Promise<ReadingSummary[]>`, newest first
  - `deleteClient(env: Env, accountId: string, clientId: string): Promise<boolean>`

`ReadingView` and `ReadingSummary`:

```ts
export interface ReadingView {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  written: number;
  total: number;
  /** In the order of the plan. */
  sections: { id: string; title: string; text: string }[];
  /** Planned sections that could not be written; filled free of charge. Empty while writing. */
  missing: { id: string; title: string }[];
  regenerations_left: number;
  editable_until: string;
  frozen: boolean;
  pdf: 'none' | 'building' | 'ready';
  pages: number | null;
  created_at: string;
}

export interface ReadingSummary {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  created_at: string;
}
```

- [ ] **Step 1: Write the failing tests**

`apps/jobs/test/readings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createClient } from '../src/pro/clients';
import { balance, grant } from '../src/pro/credits';
import { createReading, deleteClient, listReadings, readingRow, readingView } from '../src/pro/readings';
import { ANNA } from './people';
import { runJob, signIn, testEnv } from './env';

async function seller(name: string, credits = 5) {
  const { account } = await signIn(`${name}@readings.test`);
  if (credits) await grant(testEnv.DB, { accountId: account.id, delta: credits, reason: 'adjust', ref: null });
  const clientId = await createClient(testEnv, account.id, { ...ANNA, name: `Клиент ${name}` });
  return { account, clientId };
}

const jobOf = async (orderId: string) =>
  (await testEnv.DB.prepare('SELECT job_id FROM pro_readings WHERE order_id = ?').bind(orderId).first<{ job_id: string }>())
    ?.job_id as string;

describe('createReading', () => {
  it('spends the credits and queues a reading about the client', async () => {
    const { account, clientId } = await seller('natal');
    const result = await createReading(testEnv, account, { product: 'natal', client_id: clientId });
    expect(result.status).toBe('created');
    expect(await balance(testEnv.DB, account.id)).toBe(4);
    const id = (result as { id: string }).id;
    const order = await testEnv.DB.prepare('SELECT status, currency, amount_minor, pro_account_id FROM orders WHERE id = ?')
      .bind(id)
      .first();
    expect(order).toEqual({ status: 'paid', currency: 'credit', amount_minor: 1, pro_account_id: account.id });
    const chart = await testEnv.DB.prepare('SELECT expires_at FROM charts WHERE order_id = ?').bind(id).first();
    expect(chart).toEqual({ expires_at: '9999-12-31T23:59:59.999Z' });
  });

  it('charges two credits for a bundle', async () => {
    const { account, clientId } = await seller('bundle');
    await createReading(testEnv, account, { product: 'bundle', client_id: clientId });
    expect(await balance(testEnv.DB, account.id)).toBe(3);
  });

  it('refuses without enough credits and spends nothing', async () => {
    const { account, clientId } = await seller('poor', 1);
    expect(await createReading(testEnv, account, { product: 'bundle', client_id: clientId })).toEqual({
      status: 'insufficient',
      balance: 1,
    });
    expect(await balance(testEnv.DB, account.id)).toBe(1);
  });

  it('makes one reading of two taps on the last credit', async () => {
    const { account, clientId } = await seller('double', 1);
    const results = await Promise.all([
      createReading(testEnv, account, { product: 'natal', client_id: clientId }),
      createReading(testEnv, account, { product: 'natal', client_id: clientId }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['created', 'insufficient']);
    expect(await balance(testEnv.DB, account.id)).toBe(0);
  });

  it('needs a partner for a synastry and refuses one otherwise', async () => {
    const { account, clientId } = await seller('pairs');
    const partner = await createClient(testEnv, account.id, { ...ANNA, name: 'Партнёр' });
    expect((await createReading(testEnv, account, { product: 'synastry', client_id: clientId })).status).toBe('invalid');
    expect(
      (await createReading(testEnv, account, { product: 'synastry', client_id: clientId, partner_client_id: clientId }))
        .status,
    ).toBe('invalid');
    expect(
      (await createReading(testEnv, account, { product: 'natal', client_id: clientId, partner_client_id: partner }))
        .status,
    ).toBe('invalid');
    const ok = await createReading(testEnv, account, {
      product: 'synastry',
      client_id: clientId,
      partner_client_id: partner,
    });
    expect(ok.status).toBe('created');
    const charts = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM charts WHERE order_id = ?')
      .bind((ok as { id: string }).id)
      .first();
    expect(charts).toEqual({ n: 2 });
  });

  it("refuses an unknown product and another seller's client", async () => {
    const { account } = await seller('rules');
    const other = await seller('other');
    expect((await createReading(testEnv, account, { product: 'tarot', client_id: other.clientId })).status).toBe(
      'invalid',
    );
    expect((await createReading(testEnv, account, { product: 'natal', client_id: other.clientId })).status).toBe(
      'invalid',
    );
    expect(await balance(testEnv.DB, account.id)).toBe(5);
  });
});

describe('reading view', () => {
  it('says writing, then ready with every section in plan order', async () => {
    const { account, clientId } = await seller('view');
    const { id } = (await createReading(testEnv, account, { product: 'natal', client_id: clientId })) as { id: string };
    const before = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(before).toMatchObject({ status: 'writing', written: 0, total: 0, pdf: 'none', regenerations_left: 10 });

    await runJob(await jobOf(id));
    const after = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(after).toMatchObject({ status: 'ready', written: 3, total: 3, missing: [], frozen: false });
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it("hides one seller's reading from another", async () => {
    const { account, clientId } = await seller('mine');
    const stranger = await seller('theirs');
    const { id } = (await createReading(testEnv, account, { product: 'natal', client_id: clientId })) as { id: string };
    expect(await readingRow(testEnv.DB, id, stranger.account.id)).toBeNull();
  });

  it("lists a seller's readings, and a client's", async () => {
    const { account, clientId } = await seller('lists');
    const second = await createClient(testEnv, account.id, { ...ANNA, name: 'Вторая' });
    await createReading(testEnv, account, { product: 'natal', client_id: clientId });
    await createReading(testEnv, account, { product: 'forecast', client_id: second });
    expect((await listReadings(testEnv, account.id)).map((r) => r.product)).toEqual(['forecast', 'natal']);
    expect((await listReadings(testEnv, account.id, second)).map((r) => r.product)).toEqual(['forecast']);
  });
});

describe('deleteClient', () => {
  it('takes every reading the client is in, as client or partner, with its PDF', async () => {
    const { account, clientId } = await seller('gone');
    const partner = await createClient(testEnv, account.id, { ...ANNA, name: 'Уходит' });
    const own = (await createReading(testEnv, account, { product: 'natal', client_id: partner })) as { id: string };
    const pair = (await createReading(testEnv, account, {
      product: 'synastry',
      client_id: clientId,
      partner_client_id: partner,
    })) as { id: string };
    const kept = (await createReading(testEnv, account, { product: 'natal', client_id: clientId })) as { id: string };
    await testEnv.DOCS.put(`${pair.id}/synastry-ru.pdf`, 'pdf');
    await testEnv.DB.prepare(
      `INSERT INTO documents (id, order_id, storage_key, sha256, pages, bytes, lang, expires_at, created_at)
       VALUES (?, ?, ?, 'x', 1, 3, 'ru', '2999-01-01T00:00:00.000Z', '2026-10-03T00:00:00.000Z')`,
    )
      .bind(crypto.randomUUID(), pair.id, `${pair.id}/synastry-ru.pdf`)
      .run();

    expect(await deleteClient(testEnv, account.id, partner)).toBe(true);

    for (const id of [own.id, pair.id]) {
      expect(await testEnv.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(id).first()).toBeNull();
    }
    expect(await testEnv.DOCS.get(`${pair.id}/synastry-ru.pdf`)).toBeNull();
    expect(await readingRow(testEnv.DB, kept.id, account.id)).not.toBeNull();
    expect(await balance(testEnv.DB, account.id)).toBe(1);
  });

  it("refuses another seller's client", async () => {
    const owner = await seller('keeper');
    const stranger = await seller('intruder');
    expect(await deleteClient(testEnv, stranger.account.id, owner.clientId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Expected: FAIL, "Cannot find module '../src/pro/readings'".

- [ ] **Step 3: Implement**

`apps/jobs/src/pro/readings.ts`:

```ts
/** A seller's readings: ordering one with credits, reading it back, and forgetting a client.
 *
 * A reading is an order like a shopper's (the pipeline writes it the same way) with a
 * pro_readings row beside it. The credits are spent before anything is written and before any
 * row exists; if the rows cannot be written, the credits go straight back.
 */

import { encryptJson } from '../crypto';
import { documentForOrder, expiryFrom, type JobStatus, type JobStep, now, type Product } from '../db';
import type { Env } from '../env';
import { dropDocuments, type JobPayload } from '../pipeline';
import { type ClientBirth, getClient } from './clients';
import { balance, CREDIT_COST, refund, spend } from './credits';

/** Seller readings are written in Russian during the pilot. */
export const PRO_LANG = 'ru';
export const REGENERATIONS_PER_READING = 10;
export const EDITABLE_DAYS = 14;
/** A seller's charts stay with their client; the nightly sweep never reaches this date. */
export const KEEP_FOREVER = '9999-12-31T23:59:59.999Z';

export type CreateReadingResult =
  | { status: 'created'; id: string }
  | { status: 'insufficient'; balance: number }
  | { status: 'invalid'; error: string };

const isProduct = (value: unknown): value is Product =>
  typeof value === 'string' && Object.hasOwn(CREDIT_COST, value);

export async function createReading(
  env: Env,
  account: { id: string; email: string },
  input: { product?: unknown; client_id?: unknown; partner_client_id?: unknown },
): Promise<CreateReadingResult> {
  if (!isProduct(input.product)) return { status: 'invalid', error: 'product' };
  const product = input.product;
  const client =
    typeof input.client_id === 'string' ? await getClient(env, account.id, input.client_id) : null;
  if (!client) return { status: 'invalid', error: 'client' };

  const wantsPartner = input.partner_client_id !== undefined && input.partner_client_id !== null;
  let partner: (ClientBirth & { id: string }) | null = null;
  if (product === 'synastry') {
    if (typeof input.partner_client_id !== 'string' || input.partner_client_id === client.id) {
      return { status: 'invalid', error: 'partner' };
    }
    partner = await getClient(env, account.id, input.partner_client_id);
    if (!partner) return { status: 'invalid', error: 'partner' };
  } else if (wantsPartner) {
    return { status: 'invalid', error: 'partner' };
  }

  const orderId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const cost = CREDIT_COST[product];
  if (!(await spend(env.DB, { accountId: account.id, amount: cost, ref: jobId }))) {
    return { status: 'insufficient', balance: await balance(env.DB, account.id) };
  }

  const ts = now();
  try {
    const people = partner ? [client, partner] : [client];
    const charts = await Promise.all(
      people.map(async (person, index) => {
        const birth: ClientBirth = {
          name: person.name,
          date: person.date,
          time: person.time,
          latitude: person.latitude,
          longitude: person.longitude,
          zone: person.zone,
          place: person.place,
          gender: person.gender,
        };
        const { ciphertext, nonce } = await encryptJson({ ...birth, lang: PRO_LANG }, env.DATA_KEY);
        return env.DB.prepare(
          `INSERT INTO charts (id, order_id, person_no, birth_ciphertext, birth_nonce, key_version,
                               unknown_time, gender, display_name, place_label, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          orderId,
          index + 1,
          ciphertext,
          nonce,
          birth.time === null ? 1 : 0,
          birth.gender,
          birth.name,
          birth.place,
          KEEP_FOREVER,
          ts,
        );
      }),
    );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (id, email, product, locale, amount_minor, currency, status,
                             pro_account_id, created_at, paid_at)
         VALUES (?, ?, ?, ?, ?, 'credit', 'paid', ?, ?, ?)`,
      ).bind(orderId, account.email, product, PRO_LANG, cost, account.id, ts, ts),
      ...charts,
      env.DB.prepare(
        `INSERT INTO jobs (id, order_id, kind, step, status, created_at, updated_at)
         VALUES (?, ?, ?, 'calc', 'queued', ?, ?)`,
      ).bind(jobId, orderId, product, ts, ts),
      env.DB.prepare(
        `INSERT INTO pro_readings (order_id, account_id, job_id, client_id, partner_client_id,
                                   editable_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(orderId, account.id, jobId, client.id, partner?.id ?? null, expiryFrom(EDITABLE_DAYS), ts),
    ]);
  } catch (error) {
    await refund(env.DB, jobId);
    throw error;
  }
  await env.JOBS.send({ jobId });
  return { status: 'created', id: orderId };
}

export interface ReadingRow {
  order_id: string;
  account_id: string;
  job_id: string;
  client_id: string;
  partner_client_id: string | null;
  regenerations: number;
  editable_until: string;
  refunded_at: string | null;
  created_at: string;
  product: Product;
  step: JobStep;
  status: JobStatus;
  payload: string | null;
  updated_at: string;
}

const READING_SELECT = `SELECT r.order_id, r.account_id, r.job_id, r.client_id, r.partner_client_id,
       r.regenerations, r.editable_until, r.refunded_at, r.created_at,
       o.product, j.step, j.status, j.payload, j.updated_at
  FROM pro_readings r JOIN orders o ON o.id = r.order_id JOIN jobs j ON j.id = r.job_id`;

/** A reading, if it is this seller's. `accountId` null skips the owner check: the demo only. */
export function readingRow(db: D1Database, orderId: string, accountId: string | null): Promise<ReadingRow | null> {
  return accountId === null
    ? db.prepare(`${READING_SELECT} WHERE r.order_id = ?`).bind(orderId).first<ReadingRow>()
    : db.prepare(`${READING_SELECT} WHERE r.order_id = ? AND r.account_id = ?`).bind(orderId, accountId).first<ReadingRow>();
}

export type ReadingStatus = 'writing' | 'ready' | 'failed';

/** 'pdf' counts as ready: the texts are final and only the PDF is being assembled. */
export function readingStatus(row: Pick<ReadingRow, 'refunded_at' | 'step'>): ReadingStatus {
  if (row.refunded_at) return 'failed';
  return row.step === 'done' || row.step === 'pdf' ? 'ready' : 'writing';
}

export interface ReadingView {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  written: number;
  total: number;
  /** In the order of the plan. */
  sections: { id: string; title: string; text: string }[];
  /** Planned sections that could not be written; filled free of charge. Empty while writing. */
  missing: { id: string; title: string }[];
  regenerations_left: number;
  editable_until: string;
  frozen: boolean;
  pdf: 'none' | 'building' | 'ready';
  pages: number | null;
  created_at: string;
}

export async function readingView(env: Env, row: ReadingRow): Promise<ReadingView> {
  const payload: JobPayload = row.payload ? (JSON.parse(row.payload) as JobPayload) : {};
  const plan = payload.plan ?? [];
  const byId = new Map((payload.sections ?? []).map((s) => [s.id, s]));
  const status = readingStatus(row);
  const document = row.step === 'done' ? await documentForOrder(env.DB, row.order_id) : null;
  return {
    id: row.order_id,
    product: row.product,
    client_id: row.client_id,
    partner_client_id: row.partner_client_id,
    status,
    written: byId.size,
    total: plan.length,
    sections: plan.flatMap((p) => {
      const s = byId.get(p.id);
      return s ? [{ id: s.id, title: s.title, text: s.text }] : [];
    }),
    missing: status === 'ready' ? plan.filter((p) => !byId.has(p.id)).map((p) => ({ id: p.id, title: p.title })) : [],
    regenerations_left: Math.max(0, REGENERATIONS_PER_READING - row.regenerations),
    editable_until: row.editable_until,
    frozen: row.editable_until <= now(),
    pdf: row.step === 'pdf' ? 'building' : document ? 'ready' : 'none',
    pages: document?.pages ?? null,
    created_at: row.created_at,
  };
}

export interface ReadingSummary {
  id: string;
  product: Product;
  client_id: string;
  partner_client_id: string | null;
  status: ReadingStatus;
  created_at: string;
}

export async function listReadings(env: Env, accountId: string, clientId?: string): Promise<ReadingSummary[]> {
  const where = clientId
    ? 'WHERE r.account_id = ? AND (r.client_id = ? OR r.partner_client_id = ?)'
    : 'WHERE r.account_id = ?';
  const binds = clientId ? [accountId, clientId, clientId] : [accountId];
  const { results } = await env.DB.prepare(`${READING_SELECT} ${where} ORDER BY r.created_at DESC, r.rowid DESC`)
    .bind(...binds)
    .all<ReadingRow>();
  return results.map((row) => ({
    id: row.order_id,
    product: row.product,
    client_id: row.client_id,
    partner_client_id: row.partner_client_id,
    status: readingStatus(row),
    created_at: row.created_at,
  }));
}

/** Forgets a client: every reading they are in, as client or partner, goes with them — orders,
 * jobs, charts and PDFs. The ledger keeps its rows; they say what was spent, not on whom. */
export async function deleteClient(env: Env, accountId: string, clientId: string): Promise<boolean> {
  const owned = await env.DB.prepare('SELECT 1 AS yes FROM pro_clients WHERE id = ? AND account_id = ?')
    .bind(clientId, accountId)
    .first();
  if (!owned) return false;
  const { results } = await env.DB.prepare(
    'SELECT order_id FROM pro_readings WHERE account_id = ? AND (client_id = ? OR partner_client_id = ?)',
  )
    .bind(accountId, clientId, clientId)
    .all<{ order_id: string }>();
  for (const { order_id } of results) await dropDocuments(env, order_id);
  await env.DB.batch([
    ...results.map(({ order_id }) => env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(order_id)),
    env.DB.prepare('DELETE FROM pro_clients WHERE id = ? AND account_id = ?').bind(clientId, accountId),
  ]);
  return true;
}
```

Notes for the implementer:
- `Object.hasOwn` needs `lib` ES2022, which apps/jobs already targets. If tsc rejects it, use `Object.prototype.hasOwnProperty.call`.
- The two-taps test relies on `spend()` being atomic (Phase 1). Do not add a pre-check of the balance.

- [ ] **Step 4: Run to see it pass; full suite; tsc**

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/pro/readings.ts apps/jobs/test/readings.test.ts
git commit -m "Order a reading with credits, read it back, and forget a client with all their readings"
```

---

### Task 6: A failed reading settles itself on the last delivery (`src/pro/lifecycle.ts`, queue)

**Files:**
- Create: `apps/jobs/src/pro/lifecycle.ts` (this task adds `settleFailedJob`)
- Modify: `apps/jobs/src/index.ts` (queue catch block)
- Test: `apps/jobs/test/lifecycle.test.ts`

**Interfaces:**
- Consumes: `getJob`, `updateJob`, `now` (db); `refund` (credits); `JobPayload` (pipeline).
- Produces:
  - `MAX_DELIVERIES = 4`
  - `settleFailedJob(env: Env, jobId: string): Promise<boolean>`, which returns false when the job is not a seller's

Behaviour of `settleFailedJob` (seller jobs only):
- At step `pdf`: back to `step done / status done`. The texts are fine; `last_error` stays for the record.
- Nothing written (no payload, or zero sections): `refund(jobId)`, set `pro_readings.refunded_at`, set job `status failed`. Running it twice refunds once.
- Some sections written: `step done / status done`. The missing ones show up in `ReadingView.missing`.

- [ ] **Step 1: Add the shared helper, then write the failing tests**

Append to `apps/jobs/test/seed.ts` (merge the imports into the file's import block):

```ts
import { createClient } from '../src/pro/clients';
import { grant } from '../src/pro/credits';
import { createReading, readingRow } from '../src/pro/readings';
import { ANNA } from './people';

/** A signed-in seller with 3 credits, one client and one freshly ordered reading. */
export async function readingFor(name: string, overrides: Partial<typeof ANNA> = {}, product = 'natal') {
  const { account } = await signIn(`r-${crypto.randomUUID()}@life.test`);
  await grant(testEnv.DB, { accountId: account.id, delta: 3, reason: 'adjust', ref: null });
  const clientId = await createClient(testEnv, account.id, { ...ANNA, name, ...overrides });
  const created = (await createReading(testEnv, account, { product, client_id: clientId })) as { id: string };
  const row = await readingRow(testEnv.DB, created.id, account.id);
  return { account, clientId, id: created.id, jobId: row?.job_id as string };
}
```

`apps/jobs/test/lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { balance } from '../src/pro/credits';
import { settleFailedJob } from '../src/pro/lifecycle';
import { readingRow, readingView } from '../src/pro/readings';
import { armFailure, runJob, testEnv } from './env';
import { readingFor, seedOrder } from './seed';

describe('settleFailedJob', () => {
  it('gives the credits back, once, when nothing could be written', async () => {
    const { account, id, jobId } = await readingFor('Нет расчёта', { date: '1900-01-01' });
    expect(await balance(testEnv.DB, account.id)).toBe(2);
    await expect(runJob(jobId)).rejects.toThrow(/ephemeris/);

    expect(await settleFailedJob(testEnv, jobId)).toBe(true);
    expect(await settleFailedJob(testEnv, jobId)).toBe(true);

    expect(await balance(testEnv.DB, account.id)).toBe(3);
    const view = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(view.status).toBe('failed');
  });

  it('delivers what was written and lists the rest as missing', async () => {
    const { account, id, jobId } = await readingFor('Частично');
    await armFailure('Частично|b');
    await expect(runJob(jobId)).rejects.toThrow(/503/);

    expect(await settleFailedJob(testEnv, jobId)).toBe(true);
    expect(await balance(testEnv.DB, account.id)).toBe(2);
    const view = await readingView(testEnv, (await readingRow(testEnv.DB, id, account.id))!);
    expect(view).toMatchObject({ status: 'ready', written: 1 });
    expect(view.missing.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('puts a reading whose PDF would not build back to ready', async () => {
    const { jobId } = await readingFor('Без PDF');
    await runJob(jobId);
    await armFailure('Без PDF|pdf');
    await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
    await expect(runJob(jobId)).rejects.toThrow();

    expect(await settleFailedJob(testEnv, jobId)).toBe(true);
    expect(await getJob(testEnv.DB, jobId)).toMatchObject({ step: 'done', status: 'done' });
  });

  it("leaves a shopper's job to the queue", async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Покупатель' });
    expect(await settleFailedJob(testEnv, jobId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Expected: FAIL, "Cannot find module '../src/pro/lifecycle'".

- [ ] **Step 3: Implement `settleFailedJob`**

`apps/jobs/src/pro/lifecycle.ts`:

```ts
/** What happens to a seller's reading after it is ordered: settling a failure, rewriting a
 * section, assembling and fetching the PDF. */

import { getJob, now, updateJob } from '../db';
import type { Env } from '../env';
import type { JobPayload } from '../pipeline';
import { refund } from './credits';

/** Deliveries a job message gets before the queue gives up: the first plus max_retries (3, in
 * wrangler.jsonc). Keep the two in step. */
export const MAX_DELIVERIES = 4;

/** Called when the queue has delivered a seller's job for the last time and it still failed.
 * A reading never goes to the dead-letter queue: what was written is delivered, the gaps are
 * filled free on request, and a reading with nothing written gives its credits back. Returns
 * false for a shopper's job, which the queue handles as before. Safe to run twice. */
export async function settleFailedJob(env: Env, jobId: string): Promise<boolean> {
  const reading = await env.DB.prepare('SELECT order_id FROM pro_readings WHERE job_id = ?')
    .bind(jobId)
    .first<{ order_id: string }>();
  if (!reading) return false;
  const job = await getJob(env.DB, jobId);
  if (!job) return false;

  if (job.step === 'pdf') {
    // The texts are fine; only the assembly failed. The seller can ask again.
    await updateJob(env.DB, jobId, { step: 'done', status: 'done' });
    return true;
  }
  const payload: JobPayload = job.payload ? (JSON.parse(job.payload) as JobPayload) : {};
  if ((payload.sections ?? []).length === 0) {
    await refund(env.DB, jobId);
    await env.DB.prepare('UPDATE pro_readings SET refunded_at = COALESCE(refunded_at, ?) WHERE order_id = ?')
      .bind(now(), reading.order_id)
      .run();
    await updateJob(env.DB, jobId, { status: 'failed' });
    return true;
  }
  await updateJob(env.DB, jobId, { step: 'done', status: 'done' });
  return true;
}
```

- [ ] **Step 4: Wire it into the queue**

In `apps/jobs/src/index.ts`, import `{ MAX_DELIVERIES, settleFailedJob }` from `./pro/lifecycle`. In `queue()`, replace the last statement of the document job's `catch` block (`message.retry();`) with:

```ts
        if (message.attempts >= MAX_DELIVERIES) {
          try {
            if (await settleFailedJob(env, job.id)) {
              // A seller's reading is settled here rather than left in the dead-letter queue.
              message.ack();
              continue;
            }
          } catch (settleError) {
            console.error('settling a failed reading', job.id, settleError);
          }
        }
        message.retry();
```

Keep the existing `updateJob(... status: 'failed' ...)` and `console.error` lines before it.

- [ ] **Step 5: Run to see it pass; full suite; tsc**

- [ ] **Step 6: Commit**

```bash
git add apps/jobs/src/pro/lifecycle.ts apps/jobs/src/index.ts apps/jobs/test/lifecycle.test.ts apps/jobs/test/seed.ts
git commit -m "A reading that fails for good keeps what it wrote, or gives the credits back"
```

---

### Task 7: Regenerating a section (`lifecycle.ts`)

**Files:**
- Modify: `apps/jobs/src/pro/lifecycle.ts`
- Test: `apps/jobs/test/regenerate.test.ts`

**Interfaces:**
- Consumes: `readingRow`, `readingStatus`, `REGENERATIONS_PER_READING` (Task 5); `loadPeople`, `writeSection`, `dropDocuments`, `WrittenSection`, `JobPayload` (Task 2).
- Produces:
  - `type RegenerateResult = { status: 'ok'; section: { id: string; title: string; text: string }; regenerations_left: number } | { status: 'not_found' | 'not_ready' | 'frozen' | 'limit' | 'busy' | 'failed' }`
  - `regenerateSection(env: Env, accountId: string, orderId: string, sectionId: string): Promise<RegenerateResult>`

Rules:
- Only when the reading is `ready` and the job is at step `done`. Otherwise the result is `not_ready` (including while the PDF builds, and when refunded).
- `not_found`: the reading is not this seller's, or the section is not in the plan.
- A **missing** section is written free: no counter, allowed even when frozen.
- A **written** section costs one regeneration. Reserve it with `UPDATE … SET regenerations = regenerations + 1 WHERE order_id = ? AND regenerations < 10 AND editable_until > now`. With no row changed, the result is `frozen` if `editable_until <= now`, else `limit`.
- The model call failing gives the reservation back and returns `failed`.
- The text is saved with an optimistic check on `jobs.updated_at`. If another write landed first, give the reservation back and return `busy`.
- On success: tokens and cost are **added** to the job's totals, every PDF of the order is dropped (it is stale), and the result is `ok` with `regenerations_left`.

- [ ] **Step 1: Write the failing tests**

`apps/jobs/test/regenerate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { regenerateSection, settleFailedJob } from '../src/pro/lifecycle';
import { readingRow, readingView } from '../src/pro/readings';
import { armFailure, runJob, testEnv } from './env';
import { readingFor } from './seed';

const view = async (id: string, accountId: string) =>
  readingView(testEnv, (await readingRow(testEnv.DB, id, accountId))!);

describe('regenerateSection', () => {
  it('rewrites a section, counts it, adds its cost and drops the stale PDF', async () => {
    const { account, id, jobId } = await readingFor('Переписать');
    await runJob(jobId);
    await testEnv.DB.prepare("UPDATE jobs SET step = 'pdf' WHERE id = ?").bind(jobId).run();
    await runJob(jobId);
    const before = await view(id, account.id);
    const costBefore = (await getJob(testEnv.DB, jobId))?.cost_micros ?? 0;
    expect(before.pdf).toBe('ready');

    const result = await regenerateSection(testEnv, account.id, id, 'b');
    expect(result).toMatchObject({ status: 'ok', regenerations_left: 9 });

    const after = await view(id, account.id);
    expect(after.sections.find((s) => s.id === 'b')?.text).not.toBe(before.sections.find((s) => s.id === 'b')?.text);
    expect(after.sections.find((s) => s.id === 'a')?.text).toBe(before.sections.find((s) => s.id === 'a')?.text);
    expect(after.pdf).toBe('none');
    expect((await getJob(testEnv.DB, jobId))?.cost_micros).toBe(costBefore + 1000);
  });

  it('stops after ten paid rewrites', async () => {
    const { account, id, jobId } = await readingFor('Лимит');
    await runJob(jobId);
    for (let i = 0; i < 10; i++) {
      expect((await regenerateSection(testEnv, account.id, id, 'a')).status).toBe('ok');
    }
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'limit' });
  });

  it('freezes after the edit window', async () => {
    const { account, id, jobId } = await readingFor('Заморозка');
    await runJob(jobId);
    await testEnv.DB.prepare("UPDATE pro_readings SET editable_until = '2000-01-01T00:00:00.000Z' WHERE order_id = ?")
      .bind(id)
      .run();
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'frozen' });
  });

  it('fills a missing section free, even when frozen', async () => {
    const { account, id, jobId } = await readingFor('Пробел');
    await armFailure('Пробел|b');
    await expect(runJob(jobId)).rejects.toThrow();
    await settleFailedJob(testEnv, jobId);
    await testEnv.DB.prepare("UPDATE pro_readings SET editable_until = '2000-01-01T00:00:00.000Z' WHERE order_id = ?")
      .bind(id)
      .run();
    await armFailure('Пробел|b', 0);

    const result = await regenerateSection(testEnv, account.id, id, 'b');
    expect(result).toMatchObject({ status: 'ok', regenerations_left: 10 });
    const after = await view(id, account.id);
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(after.missing.map((m) => m.id)).toEqual(['c']);
  });

  it('gives the rewrite back when the model fails', async () => {
    const { account, id, jobId } = await readingFor('Отказ');
    await runJob(jobId);
    await armFailure('Отказ|a', 1);
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'failed' });
    expect((await view(id, account.id)).regenerations_left).toBe(10);
  });

  it('loses no text when two sections are rewritten at once', async () => {
    const { account, id, jobId } = await readingFor('Гонка');
    await runJob(jobId);
    const results = await Promise.all([
      regenerateSection(testEnv, account.id, id, 'a'),
      regenerateSection(testEnv, account.id, id, 'c'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.every((s) => s === 'ok' || s === 'busy')).toBe(true);
    const after = await view(id, account.id);
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    for (const r of results) {
      if (r.status === 'ok') expect(after.sections.find((s) => s.id === r.section.id)?.text).toBe(r.section.text);
    }
    expect(after.regenerations_left).toBe(10 - statuses.filter((s) => s === 'ok').length);
  });

  it('refuses while writing, for a stranger, and for an unknown section', async () => {
    const { account, id, jobId } = await readingFor('Рано');
    expect(await regenerateSection(testEnv, account.id, id, 'a')).toEqual({ status: 'not_ready' });
    await runJob(jobId);
    const stranger = await readingFor('Чужой');
    expect(await regenerateSection(testEnv, stranger.account.id, id, 'a')).toEqual({ status: 'not_found' });
    expect(await regenerateSection(testEnv, account.id, id, 'zzz')).toEqual({ status: 'not_found' });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Expected: FAIL, `regenerateSection` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/jobs/src/pro/lifecycle.ts`, and extend its imports: `import { dropDocuments, type JobPayload, loadPeople, type WrittenSection, writeSection } from '../pipeline';` and `import { readingRow, REGENERATIONS_PER_READING } from './readings';`.

```ts
export type RegenerateResult =
  | { status: 'ok'; section: { id: string; title: string; text: string }; regenerations_left: number }
  | { status: 'not_found' | 'not_ready' | 'frozen' | 'limit' | 'busy' | 'failed' };

const giveBack = (db: D1Database, orderId: string) =>
  db.prepare('UPDATE pro_readings SET regenerations = regenerations - 1 WHERE order_id = ? AND regenerations > 0')
    .bind(orderId)
    .run();

/** Rewrites one section of a finished reading. A section that was never written is filled free;
 * rewriting a written one uses one of the reading's paid rewrites, and only within the edit
 * window. The rewrite is reserved before the model is called and given back if nothing is saved. */
export async function regenerateSection(
  env: Env,
  accountId: string,
  orderId: string,
  sectionId: string,
): Promise<RegenerateResult> {
  const row = await readingRow(env.DB, orderId, accountId);
  if (!row) return { status: 'not_found' };
  if (row.refunded_at || row.step !== 'done') return { status: 'not_ready' };
  const payload: JobPayload = row.payload ? (JSON.parse(row.payload) as JobPayload) : {};
  const plan = payload.plan ?? [];
  if (!plan.some((p) => p.id === sectionId)) return { status: 'not_found' };
  const sections = payload.sections ?? [];
  const paid = sections.some((s) => s.id === sectionId);

  if (paid) {
    const ts = now();
    const reserved = await env.DB.prepare(
      `UPDATE pro_readings SET regenerations = regenerations + 1
       WHERE order_id = ? AND regenerations < ? AND editable_until > ?`,
    )
      .bind(orderId, REGENERATIONS_PER_READING, ts)
      .run();
    if (!reserved.meta.changes) return { status: row.editable_until <= ts ? 'frozen' : 'limit' };
  }

  let written: WrittenSection;
  try {
    const people = await loadPeople(env, { order_id: orderId, kind: row.product });
    const others = sections.filter((s) => s.id !== sectionId);
    written = await writeSection(env, row.product, people, payload, sectionId, others);
  } catch (error) {
    console.error('regenerating a section', orderId, sectionId, error instanceof Error ? error.message : error);
    if (paid) await giveBack(env.DB, orderId);
    return { status: 'failed' };
  }

  // Back in plan order, the new text in place of the old.
  const order = new Map(plan.map((p, index) => [p.id, index]));
  const next = [...sections.filter((s) => s.id !== sectionId), written].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  const saved = await env.DB.prepare(
    `UPDATE jobs SET payload = ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?,
                     cost_micros = cost_micros + ?, model = ?, updated_at = ?
     WHERE id = ? AND updated_at = ?`,
  )
    .bind(
      JSON.stringify({ ...payload, sections: next }),
      written.tokens_in,
      written.tokens_out,
      written.cost_micros,
      written.model,
      now(),
      row.job_id,
      row.updated_at,
    )
    .run();
  if (!saved.meta.changes) {
    // Another rewrite of this reading landed first; saving now would undo it.
    if (paid) await giveBack(env.DB, orderId);
    return { status: 'busy' };
  }
  await dropDocuments(env, orderId);

  const used = await env.DB.prepare('SELECT regenerations FROM pro_readings WHERE order_id = ?')
    .bind(orderId)
    .first<{ regenerations: number }>();
  return {
    status: 'ok',
    section: { id: written.id, title: written.title, text: written.text },
    regenerations_left: Math.max(0, REGENERATIONS_PER_READING - (used?.regenerations ?? 0)),
  };
}
```

Note: `updated_at` is written by `now()` with millisecond precision. Two rewrites can start from the same `updated_at`, and only the first save matches. That is the intended optimistic lock.

- [ ] **Step 4: Run to see it pass; full suite; tsc**

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/pro/lifecycle.ts apps/jobs/test/regenerate.test.ts
git commit -m "Rewrite one section of a reading, within its limits, without losing another's"
```

---

### Task 8: Assembling and fetching the PDF (`lifecycle.ts`)

**Files:**
- Modify: `apps/jobs/src/pro/lifecycle.ts`
- Test: `apps/jobs/test/assemble.test.ts`

**Interfaces:**
- Consumes: `readingRow`, `readingStatus` (Task 5); `loadBirth`, `JobPayload` (pipeline); `documentForOrder`, `now`; `documentFilename` from `src/filename.ts`.
- Produces:
  - `type AssembleResult = 'queued' | 'not_found' | 'not_ready' | 'incomplete' | 'building'`
  - `assemblePdf(env: Env, accountId: string, orderId: string): Promise<AssembleResult>`
  - `readingPdf(env: Env, accountId: string, orderId: string): Promise<{ body: ReadableStream; filename: string } | null>`

Rules:
- `assemblePdf`:
  - `not_found` when the reading is not this seller's.
  - `building` when the job is at step `pdf`.
  - `not_ready` when the reading is not `ready` (writing or refunded).
  - `incomplete` when any planned section is missing.
  - Otherwise it moves the job from `done` to `pdf` with a conditional `UPDATE … WHERE id = ? AND step = 'done'` (no change means `building`), sends `{ jobId }` to `JOBS`, and returns `queued`.
- `readingPdf` returns null unless the reading is this seller's and a document exists in D1 and R2.

- [ ] **Step 1: Write the failing tests**

`apps/jobs/test/assemble.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getJob } from '../src/db';
import { assemblePdf, readingPdf, regenerateSection, settleFailedJob } from '../src/pro/lifecycle';
import { armFailure, runJob, testEnv } from './env';
import { readingFor } from './seed';

describe('assemblePdf', () => {
  it('queues the assembly once, and the PDF can be fetched after', async () => {
    const { account, id, jobId } = await readingFor('Сборщица');
    await runJob(jobId);
    expect(await assemblePdf(testEnv, account.id, id)).toBe('queued');
    expect(await assemblePdf(testEnv, account.id, id)).toBe('building');
    expect((await getJob(testEnv.DB, jobId))?.step).toBe('pdf');
    expect(await readingPdf(testEnv, account.id, id)).toBeNull();

    await runJob(jobId);
    const pdf = await readingPdf(testEnv, account.id, id);
    expect(pdf?.filename).toMatch(/\.pdf$/);
    expect(new Uint8Array(await new Response(pdf?.body).arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('refuses while writing and with sections missing', async () => {
    const early = await readingFor('Ранняя');
    expect(await assemblePdf(testEnv, early.account.id, early.id)).toBe('not_ready');

    const gaps = await readingFor('Дыры');
    await armFailure('Дыры|c');
    await expect(runJob(gaps.jobId)).rejects.toThrow();
    await settleFailedJob(testEnv, gaps.jobId);
    expect(await assemblePdf(testEnv, gaps.account.id, gaps.id)).toBe('incomplete');
  });

  it('serves no PDF after a rewrite until it is assembled again', async () => {
    const { account, id, jobId } = await readingFor('Свежесть');
    await runJob(jobId);
    await assemblePdf(testEnv, account.id, id);
    await runJob(jobId);
    await regenerateSection(testEnv, account.id, id, 'a');
    expect(await readingPdf(testEnv, account.id, id)).toBeNull();
  });

  it("does not hand one seller another's PDF", async () => {
    const { account, id, jobId } = await readingFor('Владелица');
    await runJob(jobId);
    await assemblePdf(testEnv, account.id, id);
    await runJob(jobId);
    const stranger = await readingFor('Посторонняя');
    expect(await assemblePdf(testEnv, stranger.account.id, id)).toBe('not_found');
    expect(await readingPdf(testEnv, stranger.account.id, id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

- [ ] **Step 3: Implement**

Append to `apps/jobs/src/pro/lifecycle.ts`. Extend its imports: add `documentForOrder` to the db import, `loadBirth` to the pipeline import, `readingStatus` to the readings import, and `import { documentFilename } from '../filename';`.

```ts
export type AssembleResult = 'queued' | 'not_found' | 'not_ready' | 'incomplete' | 'building';

/** Puts a finished reading back on the queue to have its PDF made. Every planned section must be
 * there: a PDF with a hole in it is not something to hand a client. */
export async function assemblePdf(env: Env, accountId: string, orderId: string): Promise<AssembleResult> {
  const row = await readingRow(env.DB, orderId, accountId);
  if (!row) return 'not_found';
  if (row.step === 'pdf') return 'building';
  if (readingStatus(row) !== 'ready') return 'not_ready';
  const payload: JobPayload = row.payload ? (JSON.parse(row.payload) as JobPayload) : {};
  const written = new Set((payload.sections ?? []).map((s) => s.id));
  if ((payload.plan ?? []).some((p) => !written.has(p.id))) return 'incomplete';

  const moved = await env.DB.prepare(
    "UPDATE jobs SET step = 'pdf', status = 'queued', updated_at = ? WHERE id = ? AND step = 'done'",
  )
    .bind(now(), row.job_id)
    .run();
  if (!moved.meta.changes) return 'building';
  await env.JOBS.send({ jobId: row.job_id });
  return 'queued';
}

/** The reading's PDF and the name it should be saved under, if it has been assembled. */
export async function readingPdf(
  env: Env,
  accountId: string,
  orderId: string,
): Promise<{ body: ReadableStream; filename: string } | null> {
  const row = await readingRow(env.DB, orderId, accountId);
  if (!row || row.step !== 'done') return null;
  const document = await documentForOrder(env.DB, orderId);
  if (!document) return null;
  const object = await env.DOCS.get(document.storage_key);
  if (!object) return null;
  const first = await loadBirth(env, orderId);
  const second = row.product === 'synastry' ? await loadBirth(env, orderId, 2) : null;
  return { body: object.body, filename: documentFilename(row.product, first.lang, first, second) };
}
```

Check `documentFilename`'s parameter types in `src/filename.ts`. If they differ from `(product, lang, first, second)`, adapt the call to match how `finishedDocument` in `src/index.ts` calls it, and do not change `filename.ts`.

- [ ] **Step 4: Run to see it pass; full suite; tsc**

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/pro/lifecycle.ts apps/jobs/test/assemble.test.ts
git commit -m "Assemble a reading's PDF when the seller asks, and hand it only to them"
```

---

### Task 9: Routes for clients, readings and the demo

**Files:**
- Modify: `apps/jobs/src/pro/routes.ts`, `apps/jobs/src/env.ts`, `apps/jobs/vitest.config.ts`
- Test: `apps/jobs/test/routes-readings.test.ts`

**Interfaces:**
- Consumes: Tasks 4–8.
- Produces the HTTP contract consumed by Phase 5. All routes need `x-pro-key` and a session; JSON in and out unless noted.

| Route | Success | Errors |
|---|---|---|
| `POST /v1/pro/clients` `{...ClientBirth, consent: true}` | 201 `{ id }` | 400 `{ error: 'consent' }` if `consent !== true`; 400 `{ error: 'birth' }` |
| `GET /v1/pro/clients` | 200 `{ clients: ClientView[] }` | |
| `GET /v1/pro/clients/:id` | 200 `{ client: ClientView, readings: ReadingSummary[] }` | 404 |
| `DELETE /v1/pro/clients/:id` | 200 `{ ok: true }` | 404 |
| `POST /v1/pro/readings` `{ product, client_id, partner_client_id? }` | 201 `{ id }` | 402 `{ error: 'insufficient credits', balance }`; 400 `{ error }` |
| `GET /v1/pro/readings` | 200 `{ readings: ReadingSummary[] }` | |
| `GET /v1/pro/readings/:id` | 200 `ReadingView` | 404 |
| `POST /v1/pro/readings/:id/sections/:sectionId/regenerate` | 200 `{ section, regenerations_left }` | 404 not_found; 409 `{ error: <status> }` for not_ready, frozen, limit, busy; 503 `{ error: 'failed' }` |
| `POST /v1/pro/readings/:id/pdf` | 202 `{ ok: true }` | 404 not_found; 409 `{ error: <result> }` |
| `GET /v1/pro/readings/:id/pdf` | 200 `application/pdf`, `content-disposition` via `contentDisposition()` from `src/filename.ts`, `cache-control: private, no-store` | 404 |
| `GET /v1/pro/demo` | 200 `{ product, sections }` from the reading named by `PRO_DEMO_ORDER_ID` | 404 when unset or not ready |

- [ ] **Step 1: Env and test binding**

In `apps/jobs/src/env.ts`, after `PRO_SITE_URL`:

```ts
  /** The order of the sample reading every seller can open before they have credits. Optional:
   * without it the demo route answers 404. */
  PRO_DEMO_ORDER_ID?: string;
```

Do not add it to `vitest.config.ts`. The demo test passes an env that inherits from the test env and adds the var: `Object.assign(Object.create(testEnv), { PRO_DEMO_ORDER_ID: id })`.

- [ ] **Step 2: Write the failing tests**

`apps/jobs/test/routes-readings.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to see it fail**

- [ ] **Step 4: Implement the routes**

In `apps/jobs/src/pro/routes.ts`, import the new modules and add handlers. Keep `json`, `readBody` and the existing routes. The new branch goes after the `/v1/pro/logout` branch and before the final 404:

```ts
import { contentDisposition } from '../filename';
import { createClient, getClient, listClients, parseClientBirth } from './clients';
import { assemblePdf, readingPdf, regenerateSection } from './lifecycle';
import { createReading, deleteClient, demoReadingRow, listReadings, readingRow, readingView } from './readings';
```

```ts
async function addClient(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const body = await readBody(request);
  if (body?.consent !== true) return json({ error: 'consent' }, 400);
  const birth = parseClientBirth(body);
  if (!birth) return json({ error: 'birth' }, 400);
  return json({ id: await createClient(env, account.id, birth) }, 201);
}

async function orderReading(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const body = (await readBody(request)) ?? {};
  const result = await createReading(env, account, body);
  if (result.status === 'created') return json({ id: result.id }, 201);
  if (result.status === 'insufficient') return json({ error: 'insufficient credits', balance: result.balance }, 402);
  return json({ error: result.error }, 400);
}

/** The sample reading: texts only, nothing about whose chart it is. */
async function demo(env: Env): Promise<Response> {
  const row = env.PRO_DEMO_ORDER_ID ? await demoReadingRow(env.DB, env.PRO_DEMO_ORDER_ID) : null;
  if (!row || row.step !== 'done') return json({ error: 'not found' }, 404);
  const view = await readingView(env, row);
  return json({ product: view.product, sections: view.sections });
}

const CLIENT = /^\/v1\/pro\/clients\/([^/]+)$/;
const READING = /^\/v1\/pro\/readings\/([^/]+)$/;
const REGENERATE = /^\/v1\/pro\/readings\/([^/]+)\/sections\/([^/]+)\/regenerate$/;
const PDF = /^\/v1\/pro\/readings\/([^/]+)\/pdf$/;

async function readingRoutes(request: Request, env: Env, url: URL, account: ProAccount): Promise<Response | null> {
  const { method } = request;
  const path = url.pathname;

  if (path === '/v1/pro/clients') {
    if (method === 'POST') return addClient(request, env, account);
    if (method === 'GET') return json({ clients: await listClients(env, account.id) });
  }
  const client = path.match(CLIENT);
  if (client?.[1]) {
    if (method === 'GET') {
      const found = await getClient(env, account.id, client[1]);
      if (!found) return json({ error: 'not found' }, 404);
      return json({ client: found, readings: await listReadings(env, account.id, found.id) });
    }
    if (method === 'DELETE') {
      return (await deleteClient(env, account.id, client[1])) ? json({ ok: true }) : json({ error: 'not found' }, 404);
    }
  }
  if (path === '/v1/pro/readings') {
    if (method === 'POST') return orderReading(request, env, account);
    if (method === 'GET') return json({ readings: await listReadings(env, account.id) });
  }
  const reading = path.match(READING);
  if (reading?.[1] && method === 'GET') {
    const row = await readingRow(env.DB, reading[1], account.id);
    return row ? json(await readingView(env, row)) : json({ error: 'not found' }, 404);
  }
  const rewrite = path.match(REGENERATE);
  if (rewrite?.[1] && rewrite[2] && method === 'POST') {
    const result = await regenerateSection(env, account.id, rewrite[1], rewrite[2]);
    if (result.status === 'ok') return json({ section: result.section, regenerations_left: result.regenerations_left });
    if (result.status === 'not_found') return json({ error: 'not found' }, 404);
    if (result.status === 'failed') return json({ error: 'failed' }, 503);
    return json({ error: result.status }, 409);
  }
  const pdf = path.match(PDF);
  if (pdf?.[1]) {
    if (method === 'POST') {
      const result = await assemblePdf(env, account.id, pdf[1]);
      if (result === 'queued') return json({ ok: true }, 202);
      if (result === 'not_found') return json({ error: 'not found' }, 404);
      return json({ error: result }, 409);
    }
    if (method === 'GET') {
      const found = await readingPdf(env, account.id, pdf[1]);
      if (!found) return json({ error: 'not found' }, 404);
      return new Response(found.body, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': contentDisposition(found.filename),
          'cache-control': 'private, no-store',
        },
      });
    }
  }
  if (path === '/v1/pro/demo' && method === 'GET') return demo(env);
  return null;
}
```

In `handlePro`, before the final `return json({ error: 'not found' }, 404);`:

```ts
  const handled = await readingRoutes(request, env, url, account);
  if (handled) return handled;
```

Note: `deleteClient` lives in `readings.ts` (Task 5), not in `clients.ts`.

- [ ] **Step 5: Run to see it pass; full suite; tsc**

- [ ] **Step 6: Commit**

```bash
git add apps/jobs/src/pro/routes.ts apps/jobs/src/env.ts apps/jobs/test/routes-readings.test.ts
git commit -m "Open the seller's clients and readings over /v1/pro, with a sample to look at"
```

---

### Task 10: Record the Phase 2 decisions in the spec

**Files:**
- Modify: `docs/chronika-pro/SPEC.md`

- [ ] **Step 1: Edit the spec**

Under `## Data`, append:

```markdown
- **Readings**: texts are kept for as long as the client is (`jobs.payload`); the PDF lives 30 days
  and is re-assembled on demand. Deleting a client deletes every reading they appear in, as client
  or synastry partner, with its charts and PDFs. The credit ledger keeps its rows.
- A synastry partner is a client in the seller's base like any other.
- A shopper's job payload (calculated chart + texts) is cleared after `RETENTION_DAYS`, with the
  charts and the PDF — as the ready letter promises.
```

Under `## Money`, replace the line "A failed generation returns its credits automatically." with:

```markdown
- Credits are spent when a reading is ordered. If nothing at all could be written, they come back
  automatically. If some sections were written, the reading is delivered and the missing sections
  are written free on request (not counted in the 10 rewrites).
```

Under `## Product`, append:

```markdown
- **Demo**: one pre-generated sample reading (var `PRO_DEMO_ORDER_ID`) that every signed-in seller
  can open; it replaces trial credits for sellers without an invite code.
```

In `## Operations`, append a step:

```markdown
- Phase 2: apply migration `0009_pro_readings.sql` (`pnpm --filter @natalka/jobs migrate`, a
  production write) **before** deploying the worker — the nightly sweep reads `orders.pro_account_id`.
  Demo: once the cabinet exists, order a natal reading for a sample chart from the owner's seller
  account, then set `PRO_DEMO_ORDER_ID` to its id in `apps/jobs/wrangler.jsonc` vars and deploy.
```

- [ ] **Step 2: Commit**

```bash
git add docs/chronika-pro/SPEC.md
git commit -m "Write down what phase 2 decided about readings, refunds and the demo"
```

---

## Self-review notes

**Spec coverage:**

| Requirement | Task |
|---|---|
| Clients encrypted, consent, delete | 4, 5, 9 |
| Create reading spends credits; all five products, bundle 2 | 5 |
| Pipeline stops after texts for sellers | 2 |
| Section view | 5 |
| Regenerate: 10 within 14 days, missing ones free | 7 |
| Assemble PDF on demand; PDF stale after rewrite | 2, 7, 8 |
| Refund only when nothing was written; partial reading delivered | 6 |
| Seller charts kept; B2C payload scrubbed | 3, 5 |
| Demo | 9, 10 |

Left for later phases: brand in the PDF, the «ты/вы» prompt parameter, and removing Chronika strings from the PDF (all Phase 3); funnel counters (Phase 6).

**Known limitations, deliberately accepted:**
- `regenerateSection` calls the model synchronously inside the HTTP request, which takes about 30 s. The Phase 5 web route must allow for that.
- Two rewrites of one reading at the same moment give one `busy`, which the UI retries.
