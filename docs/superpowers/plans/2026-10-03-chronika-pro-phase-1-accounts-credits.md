# Chronika Pro — Phase 1: Accounts & Credits API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/jobs` the seller side of Chronika Pro, without any UI yet: sign-in by magic link, sessions, an append-only credit ledger, and invite codes that grant trial credits, all exposed under `/v1/pro/*`.

**Architecture:**
- Each concern lives in its own module under `apps/jobs/src/pro/`: `auth.ts`, `credits.ts`, `invites.ts` and `routes.ts`. They share the existing D1 database and `crypto.ts`.
- Login tokens are random, single-use and stored only as a SHA-256 hash.
- Sessions are HS256 tokens signed with a new `SESSION_KEY`, separate from the download-link key. They carry a `session_epoch`, so "log out everywhere" is one UPDATE.
- The balance is `SUM(delta)` over `credit_ledger`. A spend is a single conditional `INSERT … SELECT … WHERE balance >= n`, so concurrent spends cannot overdraw.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), TypeScript (strict), Vitest + `@cloudflare/vitest-plugin` (new for this package), Resend over HTTPS.

**Spec:** `docs/chronika-pro/SPEC.md` (sections *Access*, *Money*, *Architecture*, and Roadmap row 1).

## Global Constraints

- No auth libraries, no ORM, no Redis. Plain SQL through `D1Database`, as in `apps/jobs/src/db.ts`.
- Timestamps are ISO-8601 UTC strings (`now()` from `src/db.ts`). Ids are `crypto.randomUUID()`. Enum-like columns are `TEXT` plus `CHECK`.
- Credits: **bundle = 2, every other product = 1**. Credits **never expire**.
- Trial credits only through an invite code: **one redemption per account**.
- Seller-facing copy is in **Russian** (pilot language). Code, comments and commits are in **English**.
- Mail comes from `chronika.me` via Resend (the existing `FROM` in `src/mail.ts`). The pro site is `https://pro.chronika.me`.
- Secrets come only from worker secrets (`wrangler secret put`). Never print them or commit them.
- Schema changes are approved in principle (owner, 2026-10-03). Applying the migration to the **remote** D1 is a production write, so it needs the owner's explicit go-ahead in the same message.
- Commit messages follow the repo style: an English sentence describing the outcome, e.g. "Sign sellers in by a link that works once". Each ends with the `Co-Authored-By` trailer the session supplies.

## Review Focus

1. **Mail scanners pre-fetching the magic link.** Outlook Safe Links and Gmail open URLs with GET. Expected: no GET request can consume a login token. Only `POST /v1/pro/session` consumes one. → test in Task 6.
2. **The same person typing their address differently** (`" Anna@Mail.RU "` vs `anna@mail.ru`). Expected: one account. → test in Task 3.
3. **Double-tap on "create reading" with 1 credit left.** Expected: exactly one spend succeeds and the balance never goes negative. → test in Task 4.
4. **An invite code's last use claimed by two sellers at once, or one seller redeeming twice.** Expected: uses never exceed `max_uses`, and one grant per account. → tests in Task 5.
5. **Forged or garbage bearer tokens**, including a valid download-link token (signed with `LINK_KEY`) replayed as a session. Expected: a clean 401, never a 500. → tests in Task 3 and Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/jobs/vitest.config.ts` | Test runtime: miniflare bindings and migrations as a binding |
| `apps/jobs/test/apply-migrations.ts` | Applies all D1 migrations before the tests |
| `apps/jobs/test/env.ts` | Typed test env and a `signIn()` helper |
| `apps/jobs/migrations/0008_pro_accounts.sql` | Accounts, login tokens, invite codes, redemptions, credit ledger |
| `apps/jobs/src/pro/auth.ts` | Email normalisation, login tokens, sessions, authentication |
| `apps/jobs/src/pro/credits.ts` | Credit costs, balance, grant, spend, refund |
| `apps/jobs/src/pro/invites.ts` | Redeeming an invite code atomically |
| `apps/jobs/src/pro/routes.ts` | `/v1/pro/*` HTTP handlers |
| `apps/jobs/src/mail.ts` | + `sendLoginLink` |
| `apps/jobs/src/env.ts` | + `SESSION_KEY`, `PRO_SITE_URL` |
| `apps/jobs/src/index.ts` | Mount `handlePro`; sweep old login tokens nightly |
| `apps/jobs/wrangler.jsonc` | + `PRO_SITE_URL` var |
| `.github/workflows/ci.yml` | + jobs job (typecheck, tests) |

---

### Task 1: Test harness for `apps/jobs`

**Files:**
- Modify: `apps/jobs/package.json`
- Create: `apps/jobs/vitest.config.ts`, `apps/jobs/test/apply-migrations.ts`, `apps/jobs/test/env.ts` (stub for now), `apps/jobs/test/health.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `testEnv: Env` from `test/env.ts`. All later test files import it.

- [ ] **Step 1: Install the test tooling**

Run: `pnpm --filter @natalka/jobs add -D vitest @cloudflare/vitest-plugin`
Expected: both appear in `apps/jobs/package.json` devDependencies and `pnpm-lock.yaml` updates. If pnpm warns about a peer-version mismatch, install the `vitest` version the plugin's `peerDependencies` names.

- [ ] **Step 2: Add the test script**

In `apps/jobs/package.json` `scripts`, add after `"typecheck"`:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Write the vitest config**

`apps/jobs/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The real wrangler.jsonc names service bindings (the API container, the ephemeris service, the
// bot) that do not exist in a test run, so the runtime is described here instead. Keys are fixed
// test values, never the production secrets.
const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)));

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      miniflare: {
        compatibilityDate: '2026-09-01',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['DOCS'],
        queueProducers: { JOBS: 'natalka-jobs' },
        bindings: {
          TEST_MIGRATIONS: migrations,
          NATALKA_API_URL: 'https://api.test',
          RETENTION_DAYS: '30',
          SITE_URL: 'https://chronika.test',
          PRO_SITE_URL: 'https://pro.chronika.test',
          DATA_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          LINK_KEY: 'test-link-key',
          SESSION_KEY: 'test-session-key',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
```

If the installed plugin version names `main` or `miniflare` differently, check its README in `node_modules/@cloudflare/vitest-plugin`. Keep the same intent: entry `src/index.ts`, the bindings above, and no `wrangler.jsonc`.

- [ ] **Step 4: Apply migrations before tests**

`apps/jobs/test/apply-migrations.ts`:

```ts
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

const testEnv = env as unknown as {
  DB: D1Database;
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
```

- [ ] **Step 5: Typed env for tests**

`apps/jobs/test/env.ts`:

```ts
import { env } from 'cloudflare:workers';
import type { Env } from '../src/env';

/** The worker's bindings as the tests see them. */
export const testEnv = env as unknown as Env;
```

- [ ] **Step 6: Write the smoke test**

`apps/jobs/test/health.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { testEnv } from './env';

it('answers /health', async () => {
  const response = await SELF.fetch('https://jobs.test/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

it('has the schema applied', async () => {
  const row = await testEnv.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'",
  ).first<{ name: string }>();
  expect(row?.name).toBe('orders');
});
```

- [ ] **Step 7: Run it**

Run: `pnpm --filter @natalka/jobs test`
Expected: 2 passed.

- [ ] **Step 8: Run the jobs typecheck and tests in CI**

In `.github/workflows/ci.yml`, add a job modelled on the existing `web` job. Copy its `runs-on`, checkout, pnpm and node setup steps exactly as they are in that job:

```yaml
  jobs:
    name: jobs (types · tests)
    runs-on: ubuntu-latest
    steps:
      # same checkout / pnpm / node setup steps as the web job
      - run: pnpm install --frozen-lockfile
      - name: typecheck
        run: pnpm --filter @natalka/jobs exec tsc --noEmit
      - name: tests
        run: pnpm --filter @natalka/jobs test
```

Note: `tsc --noEmit` on jobs must already pass before this change. Run `pnpm --filter @natalka/jobs exec tsc --noEmit` locally first. If it fails on existing code, stop and report: do not fix unrelated code inside this task.

- [ ] **Step 9: Lint and commit**

Run: `pnpm exec biome check apps/jobs`
Expected: no errors (fix formatting with `pnpm exec biome check --write apps/jobs/test apps/jobs/vitest.config.ts`).

```bash
git add apps/jobs/package.json apps/jobs/vitest.config.ts apps/jobs/test pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "Test the jobs worker against a real D1, in CI too"
```

---

### Task 2: Migration `0008_pro_accounts.sql`

**Files:**
- Create: `apps/jobs/migrations/0008_pro_accounts.sql`
- Test: `apps/jobs/test/schema.test.ts`

**Interfaces:**
- Produces these tables, used by Tasks 3–6:
  - `pro_accounts(id, email UNIQUE, tone 'ty'|'vy', session_epoch, created_at)`
  - `pro_login_tokens(token_hash PK, email, expires_at, used_at, created_at)`
  - `pro_invite_codes(code PK UPPERCASE, credits, max_uses, uses, note, expires_at, created_at)`
  - `pro_invite_redemptions(account_id PK, code, credits, created_at)`
  - `credit_ledger(id, account_id, delta ≠ 0, reason ∈ purchase|trial|report|refund|adjust, ref, created_at)` with `UNIQUE(reason, ref) WHERE ref IS NOT NULL`

- [ ] **Step 1: Write the failing test**

`apps/jobs/test/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { testEnv } from './env';

const db = () => testEnv.DB;
const ts = '2026-10-03T00:00:00.000Z';

async function account(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .prepare('INSERT INTO pro_accounts (id, email, created_at) VALUES (?, ?, ?)')
    .bind(id, email, ts)
    .run();
  return id;
}

describe('0008 pro schema', () => {
  it('keeps one account per email', async () => {
    await account('one@schema.test');
    await expect(account('one@schema.test')).rejects.toThrow(/UNIQUE/);
  });

  it('defaults tone to vy and epoch to 0', async () => {
    const id = await account('defaults@schema.test');
    const row = await db()
      .prepare('SELECT tone, session_epoch FROM pro_accounts WHERE id = ?')
      .bind(id)
      .first<{ tone: string; session_epoch: number }>();
    expect(row).toEqual({ tone: 'vy', session_epoch: 0 });
  });

  it('refuses a zero ledger entry and an unknown reason', async () => {
    const id = await account('ledger@schema.test');
    const insert = (delta: number, reason: string) =>
      db()
        .prepare(
          'INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
        )
        .bind(crypto.randomUUID(), id, delta, reason, ts)
        .run();
    await expect(insert(0, 'adjust')).rejects.toThrow(/CHECK/);
    await expect(insert(1, 'gift')).rejects.toThrow(/CHECK/);
    await insert(1, 'adjust');
  });

  it('records a (reason, ref) pair once', async () => {
    const id = await account('once@schema.test');
    const insert = () =>
      db()
        .prepare(
          "INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at) VALUES (?, ?, 10, 'purchase', 'cs_once', ?)",
        )
        .bind(crypto.randomUUID(), id, ts)
        .run();
    await insert();
    await expect(insert()).rejects.toThrow(/UNIQUE/);
  });

  it('stores invite codes in upper case only', async () => {
    const insert = (code: string) =>
      db()
        .prepare(
          'INSERT INTO pro_invite_codes (code, credits, max_uses, created_at) VALUES (?, 3, 10, ?)',
        )
        .bind(code, ts)
        .run();
    await expect(insert('lower')).rejects.toThrow(/CHECK/);
    await insert('UPPER');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @natalka/jobs test -- schema`
Expected: FAIL, "no such table: pro_accounts".

- [ ] **Step 3: Write the migration**

`apps/jobs/migrations/0008_pro_accounts.sql`:

```sql
-- Chronika Pro: the sellers who resell our readings under their own brand, how they sign in,
-- the invite codes that bring them, and the credits they spend.
--
-- Credits are a ledger, never a balance column: every purchase, trial grant, spend and refund is
-- a row, and the balance is their sum. Nothing is updated in place, so the history explains every
-- number, and a spend can be made conditional on the sum in a single statement.

CREATE TABLE pro_accounts (
  id            TEXT PRIMARY KEY,
  -- Stored normalised (trimmed, lower case): one address, one account.
  email         TEXT NOT NULL UNIQUE,
  -- How readings address the seller's clients: «ты» or «вы».
  tone          TEXT NOT NULL DEFAULT 'vy' CHECK (tone IN ('ty','vy')),
  -- Sessions carry this number; raising it signs the account out everywhere.
  session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- Magic links. Only the hash of a token is kept: a database dump cannot sign anyone in.
CREATE TABLE pro_login_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX pro_login_tokens_email ON pro_login_tokens (email, created_at);

CREATE TABLE pro_invite_codes (
  code       TEXT PRIMARY KEY CHECK (code = upper(code)),
  credits    INTEGER NOT NULL CHECK (credits > 0),
  max_uses   INTEGER NOT NULL CHECK (max_uses > 0),
  uses       INTEGER NOT NULL DEFAULT 0,
  -- Who the code was made for — the only record of where a seller came from.
  note       TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

-- One invite per account, ever: the primary key is the account.
CREATE TABLE pro_invite_redemptions (
  account_id TEXT PRIMARY KEY REFERENCES pro_accounts(id),
  code       TEXT NOT NULL REFERENCES pro_invite_codes(code),
  credits    INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE credit_ledger (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES pro_accounts(id),
  delta      INTEGER NOT NULL CHECK (delta <> 0),
  reason     TEXT NOT NULL CHECK (reason IN ('purchase','trial','report','refund','adjust')),
  -- What caused the entry: a Stripe session, a job, an invite. A cause is booked once.
  ref        TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX credit_ledger_account ON credit_ledger (account_id);
CREATE UNIQUE INDEX credit_ledger_once ON credit_ledger (reason, ref) WHERE ref IS NOT NULL;
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @natalka/jobs test -- schema`
Expected: 5 passed.

- [ ] **Step 5: Apply locally and commit**

Run: `pnpm --filter @natalka/jobs migrate:local`
Expected: `0008_pro_accounts.sql` applied. Do **not** run `migrate` (remote) in this task.

```bash
git add apps/jobs/migrations/0008_pro_accounts.sql apps/jobs/test/schema.test.ts
git commit -m "A place for sellers, their sign-in links and their credits"
```

---

### Task 3: Sign-in tokens and sessions (`src/pro/auth.ts`)

**Files:**
- Create: `apps/jobs/src/pro/auth.ts`
- Modify: `apps/jobs/src/env.ts`, `apps/jobs/src/index.ts` (nightly sweep), `apps/jobs/test/env.ts` (helper)
- Test: `apps/jobs/test/auth.test.ts`

**Interfaces:**
- Consumes: `signToken`, `verifyToken`, `sha256Hex` from `src/crypto.ts`; `now` from `src/db.ts`.
- Produces:
  - `interface ProAccount { id: string; email: string; tone: 'ty' | 'vy'; session_epoch: number; created_at: string }`
  - `normalizeEmail(raw: unknown): string | null`
  - `createLoginToken(db: D1Database, email: string): Promise<string | null>` returns null when throttled
  - `consumeLoginToken(db: D1Database, raw: string): Promise<ProAccount | null>`
  - `issueSession(env: Env, account: ProAccount): Promise<string>`
  - `authenticate(request: Request, env: Env): Promise<ProAccount | null>`
  - `endSessions(db: D1Database, accountId: string): Promise<void>`
  - constants `LOGIN_TTL_SECONDS = 900`, `SESSION_TTL_SECONDS = 2_592_000`, `LOGIN_REQUESTS_PER_HOUR = 5`
  - test helper `signIn(email: string): Promise<{ account: ProAccount; session: string }>`

- [ ] **Step 1: Add the env fields**

In `apps/jobs/src/env.ts`, inside `interface Env` after `LINK_KEY`:

```ts
  /** HMAC secret for Chronika Pro sessions. Worker secret; never the same value as LINK_KEY, so a
   * download link can never be replayed as a session. */
  SESSION_KEY: string;
  /** Where the seller cabinet lives; sign-in letters link to it. */
  PRO_SITE_URL: string;
```

- [ ] **Step 2: Add the sign-in helper for tests**

Append to `apps/jobs/test/env.ts`:

```ts
import { consumeLoginToken, createLoginToken, issueSession, type ProAccount } from '../src/pro/auth';

/** A signed-in seller with a fresh session, for tests that need one. */
export async function signIn(email: string): Promise<{ account: ProAccount; session: string }> {
  const raw = await createLoginToken(testEnv.DB, email);
  if (!raw) throw new Error('throttled');
  const account = await consumeLoginToken(testEnv.DB, raw);
  if (!account) throw new Error('sign-in failed');
  return { account, session: await issueSession(testEnv, account) };
}
```

(Move the imports to the top of the file next to the existing ones.)

- [ ] **Step 3: Write the failing tests**

`apps/jobs/test/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signToken } from '../src/crypto';
import {
  authenticate,
  consumeLoginToken,
  createLoginToken,
  endSessions,
  issueSession,
  LOGIN_REQUESTS_PER_HOUR,
  normalizeEmail,
} from '../src/pro/auth';
import { signIn, testEnv } from './env';

const bearer = (token: string) =>
  new Request('https://jobs.test/v1/pro/me', { headers: { authorization: `Bearer ${token}` } });

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Anna@Mail.RU ')).toBe('anna@mail.ru');
  });

  it('rejects what is not an address', () => {
    for (const bad of ['', 'anna', 'a@b', 'a b@c.de', `${'a'.repeat(250)}@x.io`, 42, null]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe('login tokens', () => {
  it('creates the account on first use and works only once', async () => {
    const raw = await createLoginToken(testEnv.DB, 'first@auth.test');
    expect(raw).toBeTruthy();
    const account = await consumeLoginToken(testEnv.DB, raw as string);
    expect(account?.email).toBe('first@auth.test');
    expect(account?.tone).toBe('vy');
    expect(await consumeLoginToken(testEnv.DB, raw as string)).toBeNull();
  });

  it('signs one address into one account however it was typed', async () => {
    const a = await signIn(normalizeEmail(' Same@Auth.TEST') as string);
    const b = await signIn(normalizeEmail('same@auth.test') as string);
    expect(a.account.id).toBe(b.account.id);
  });

  it('refuses an expired token', async () => {
    const raw = (await createLoginToken(testEnv.DB, 'late@auth.test')) as string;
    await testEnv.DB.prepare(
      "UPDATE pro_login_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?",
    )
      .bind('late@auth.test')
      .run();
    expect(await consumeLoginToken(testEnv.DB, raw)).toBeNull();
  });

  it('refuses an unknown or empty token', async () => {
    expect(await consumeLoginToken(testEnv.DB, 'never-issued')).toBeNull();
    expect(await consumeLoginToken(testEnv.DB, '')).toBeNull();
  });

  it('keeps only a hash of the token', async () => {
    const raw = (await createLoginToken(testEnv.DB, 'hash@auth.test')) as string;
    const row = await testEnv.DB.prepare('SELECT token_hash FROM pro_login_tokens WHERE email = ?')
      .bind('hash@auth.test')
      .first<{ token_hash: string }>();
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.token_hash).not.toBe(raw);
  });

  it(`stops issuing after ${LOGIN_REQUESTS_PER_HOUR} links an hour`, async () => {
    for (let i = 0; i < LOGIN_REQUESTS_PER_HOUR; i++) {
      expect(await createLoginToken(testEnv.DB, 'busy@auth.test')).toBeTruthy();
    }
    expect(await createLoginToken(testEnv.DB, 'busy@auth.test')).toBeNull();
  });
});

describe('sessions', () => {
  it('authenticates a fresh session', async () => {
    const { account, session } = await signIn('fresh@auth.test');
    expect((await authenticate(bearer(session), testEnv))?.id).toBe(account.id);
  });

  it('stops working after the account signs out everywhere', async () => {
    const { account, session } = await signIn('out@auth.test');
    await endSessions(testEnv.DB, account.id);
    expect(await authenticate(bearer(session), testEnv)).toBeNull();
    const again = await issueSession(testEnv, { ...account, session_epoch: account.session_epoch + 1 });
    expect((await authenticate(bearer(again), testEnv))?.id).toBe(account.id);
  });

  it('refuses a token signed with the download-link key', async () => {
    const { account } = await signIn('replay@auth.test');
    const forged = await signToken(
      { typ: 'pro', sub: account.id, epoch: account.session_epoch },
      testEnv.LINK_KEY,
      60,
    );
    expect(await authenticate(bearer(forged), testEnv)).toBeNull();
  });

  it('refuses a session-key token of another type', async () => {
    const { account } = await signIn('typ@auth.test');
    const other = await signToken({ sub: account.id, epoch: 0 }, testEnv.SESSION_KEY, 60);
    expect(await authenticate(bearer(other), testEnv)).toBeNull();
  });

  it('answers garbage with null, not an exception', async () => {
    for (const junk of ['', 'abc', 'a.b.c', 'not.a.token!', '%%%.%%%.%%%']) {
      expect(await authenticate(bearer(junk), testEnv)).toBeNull();
    }
    expect(await authenticate(new Request('https://jobs.test/'), testEnv)).toBeNull();
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `pnpm --filter @natalka/jobs test -- auth`
Expected: FAIL, "Cannot find module '../src/pro/auth'".

- [ ] **Step 5: Implement**

`apps/jobs/src/pro/auth.ts`:

```ts
/** Signing sellers in to Chronika Pro.
 *
 * No passwords and no auth library: a seller asks for a link, the link carries a random token
 * that works once for fifteen minutes, and spending it yields a session token signed with a key
 * of its own. Only the hash of a login token is stored. Sessions carry the account's epoch, so
 * raising the epoch signs the account out of every device at once.
 */

import { sha256Hex, signToken, verifyToken } from '../crypto';
import { now } from '../db';
import type { Env } from '../env';

export const LOGIN_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Links one address may be sent per hour; past this a request is accepted and quietly dropped. */
export const LOGIN_REQUESTS_PER_HOUR = 5;

export interface ProAccount {
  id: string;
  email: string;
  tone: 'ty' | 'vy';
  session_epoch: number;
  created_at: string;
}

const ACCOUNT_COLUMNS = 'id, email, tone, session_epoch, created_at';

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

const hashToken = (raw: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(raw).buffer as ArrayBuffer);

/** 256 random bits, URL-safe. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A single-use sign-in token for an address, or null when it has asked too often this hour. */
export async function createLoginToken(db: D1Database, email: string): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM pro_login_tokens WHERE email = ? AND created_at > ?')
    .bind(email, hourAgo)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= LOGIN_REQUESTS_PER_HOUR) return null;

  const raw = randomToken();
  await db
    .prepare(
      'INSERT INTO pro_login_tokens (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(
      await hashToken(raw),
      email,
      new Date(Date.now() + LOGIN_TTL_SECONDS * 1000).toISOString(),
      now(),
    )
    .run();
  return raw;
}

/** Spends a sign-in token and returns the account behind it, creating it on first sign-in.
 * The UPDATE is the whole check: of two requests racing with one token, only one gets a row. */
export async function consumeLoginToken(db: D1Database, raw: string): Promise<ProAccount | null> {
  if (!raw) return null;
  const ts = now();
  const used = await db
    .prepare(
      `UPDATE pro_login_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING email`,
    )
    .bind(ts, await hashToken(raw), ts)
    .first<{ email: string }>();
  if (!used) return null;

  await db
    .prepare('INSERT INTO pro_accounts (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING')
    .bind(crypto.randomUUID(), used.email, ts)
    .run();
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM pro_accounts WHERE email = ?`)
    .bind(used.email)
    .first<ProAccount>();
}

export const issueSession = (env: Env, account: ProAccount): Promise<string> =>
  signToken(
    { typ: 'pro', sub: account.id, epoch: account.session_epoch },
    env.SESSION_KEY,
    SESSION_TTL_SECONDS,
  );

/** The account behind a request's bearer session, or null. Never throws on a malformed token:
 * whatever arrives in the header is somebody else's input. */
export async function authenticate(request: Request, env: Env): Promise<ProAccount | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return null;
  let claims: { typ?: unknown; sub?: unknown; epoch?: unknown } | null;
  try {
    claims = await verifyToken(token, env.SESSION_KEY);
  } catch {
    return null;
  }
  if (!claims || claims.typ !== 'pro' || typeof claims.sub !== 'string') return null;
  if (typeof claims.epoch !== 'number') return null;
  return env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM pro_accounts WHERE id = ? AND session_epoch = ?`)
    .bind(claims.sub, claims.epoch)
    .first<ProAccount>();
}

/** Signs the account out everywhere: every session issued so far stops matching. */
export async function endSessions(db: D1Database, accountId: string): Promise<void> {
  await db
    .prepare('UPDATE pro_accounts SET session_epoch = session_epoch + 1 WHERE id = ?')
    .bind(accountId)
    .run();
}
```

- [ ] **Step 6: Sweep spent sign-in tokens nightly**

In `apps/jobs/src/index.ts`, `scheduled()`, after the line that deletes from `previews`:

```ts
    // Sign-in links are worth nothing a day after they expire; the hour of history the throttle
    // needs is long past by then.
    await env.DB.prepare('DELETE FROM pro_login_tokens WHERE expires_at < ?')
      .bind(new Date(Date.now() - 86_400_000).toISOString())
      .run();
```

- [ ] **Step 7: Run to see it pass**

Run: `pnpm --filter @natalka/jobs test -- auth`
Expected: all auth tests pass.
Run: `pnpm --filter @natalka/jobs exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/jobs/src/pro/auth.ts apps/jobs/src/env.ts apps/jobs/src/index.ts apps/jobs/test/env.ts apps/jobs/test/auth.test.ts
git commit -m "Sign sellers in by a link that works once"
```

---

### Task 4: Credit ledger (`src/pro/credits.ts`)

**Files:**
- Create: `apps/jobs/src/pro/credits.ts`
- Test: `apps/jobs/test/credits.test.ts`

**Interfaces:**
- Consumes: `now`, `type Product` from `src/db.ts`.
- Produces:
  - `CREDIT_COST: Record<Product, number>`
  - `type CreditReason = 'purchase' | 'trial' | 'report' | 'refund' | 'adjust'`
  - `balance(db: D1Database, accountId: string): Promise<number>`
  - `grant(db: D1Database, entry: { accountId: string; delta: number; reason: Exclude<CreditReason, 'report' | 'refund'>; ref: string | null }): Promise<boolean>` returns false when that `(reason, ref)` was already booked
  - `spend(db: D1Database, entry: { accountId: string; amount: number; ref: string }): Promise<boolean>` returns false when the balance is short or `ref` was already spent
  - `refund(db: D1Database, ref: string): Promise<boolean>` returns exactly what the `report` entry with that ref took, once

- [ ] **Step 1: Write the failing tests**

`apps/jobs/test/credits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { balance, CREDIT_COST, grant, refund, spend } from '../src/pro/credits';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const seller = async (name: string) => (await signIn(`${name}@credits.test`)).account.id;

describe('credits', () => {
  it('weighs a bundle as two and everything else as one', () => {
    expect(CREDIT_COST).toEqual({ natal: 1, forecast: 1, synastry: 1, child: 1, bundle: 2 });
  });

  it('starts at zero and is the sum of the ledger', async () => {
    const id = await seller('sum');
    expect(await balance(db(), id)).toBe(0);
    await grant(db(), { accountId: id, delta: 10, reason: 'purchase', ref: 'cs_sum' });
    await spend(db(), { accountId: id, amount: 2, ref: 'job-sum' });
    expect(await balance(db(), id)).toBe(8);
  });

  it('books a purchase once however often the webhook repeats it', async () => {
    const id = await seller('repeat');
    expect(await grant(db(), { accountId: id, delta: 10, reason: 'purchase', ref: 'cs_rep' })).toBe(true);
    expect(await grant(db(), { accountId: id, delta: 10, reason: 'purchase', ref: 'cs_rep' })).toBe(false);
    expect(await balance(db(), id)).toBe(10);
  });

  it('refuses to spend more than the balance', async () => {
    const id = await seller('short');
    await grant(db(), { accountId: id, delta: 1, reason: 'adjust', ref: null });
    expect(await spend(db(), { accountId: id, amount: 2, ref: 'job-short' })).toBe(false);
    expect(await balance(db(), id)).toBe(1);
  });

  it('lets only one of two simultaneous spends through on the last credit', async () => {
    const id = await seller('race');
    await grant(db(), { accountId: id, delta: 1, reason: 'adjust', ref: null });
    const results = await Promise.all([
      spend(db(), { accountId: id, amount: 1, ref: 'job-race-a' }),
      spend(db(), { accountId: id, amount: 1, ref: 'job-race-b' }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(db(), id)).toBe(0);
  });

  it('spends a job once', async () => {
    const id = await seller('twice');
    await grant(db(), { accountId: id, delta: 5, reason: 'adjust', ref: null });
    expect(await spend(db(), { accountId: id, amount: 1, ref: 'job-twice' })).toBe(true);
    expect(await spend(db(), { accountId: id, amount: 1, ref: 'job-twice' })).toBe(false);
    expect(await balance(db(), id)).toBe(4);
  });

  it('refunds exactly what a failed job took, once', async () => {
    const id = await seller('refund');
    await grant(db(), { accountId: id, delta: 5, reason: 'adjust', ref: null });
    await spend(db(), { accountId: id, amount: 2, ref: 'job-refund' });
    expect(await refund(db(), 'job-refund')).toBe(true);
    expect(await refund(db(), 'job-refund')).toBe(false);
    expect(await balance(db(), id)).toBe(5);
  });

  it('refunds nothing for a job that never spent', async () => {
    expect(await refund(db(), 'job-never')).toBe(false);
  });

  it('refuses a non-positive spend', async () => {
    const id = await seller('zero');
    await grant(db(), { accountId: id, delta: 5, reason: 'adjust', ref: null });
    expect(await spend(db(), { accountId: id, amount: 0, ref: 'job-zero' })).toBe(false);
    expect(await spend(db(), { accountId: id, amount: -3, ref: 'job-neg' })).toBe(false);
    expect(await balance(db(), id)).toBe(5);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @natalka/jobs test -- credits`
Expected: FAIL, "Cannot find module '../src/pro/credits'".

- [ ] **Step 3: Implement**

`apps/jobs/src/pro/credits.ts`:

```ts
/** Credits: what a seller has paid for and not yet spent.
 *
 * A ledger, not a counter. Each entry is booked once per cause — (reason, ref) is unique — so a
 * webhook delivered twice or a retried job cannot book twice. A spend is one INSERT whose SELECT
 * only yields a row while the balance covers it; SQLite runs it as a single write, so two spends
 * racing for the last credit cannot both land.
 */

import { now, type Product } from '../db';

export const CREDIT_COST: Record<Product, number> = {
  natal: 1,
  forecast: 1,
  synastry: 1,
  child: 1,
  bundle: 2,
};

export type CreditReason = 'purchase' | 'trial' | 'report' | 'refund' | 'adjust';

export async function balance(db: D1Database, accountId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE account_id = ?')
    .bind(accountId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Adds (or, for an adjustment, removes) credits. False when this cause was already booked. */
export async function grant(
  db: D1Database,
  entry: {
    accountId: string;
    delta: number;
    reason: Exclude<CreditReason, 'report' | 'refund'>;
    ref: string | null;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), entry.accountId, entry.delta, entry.reason, entry.ref, now())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Takes `amount` credits for the job named by `ref`. False when the balance is short or the job
 * has already paid. */
export async function spend(
  db: D1Database,
  entry: { accountId: string; amount: number; ref: string },
): Promise<boolean> {
  if (!Number.isInteger(entry.amount) || entry.amount <= 0) return false;
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       SELECT ?, ?, ?, 'report', ?, ?
       WHERE (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE account_id = ?) >= ?`,
    )
    .bind(
      crypto.randomUUID(),
      entry.accountId,
      -entry.amount,
      entry.ref,
      now(),
      entry.accountId,
      entry.amount,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Gives back what the job named by `ref` took. False when it took nothing or was refunded. */
export async function refund(db: D1Database, ref: string): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
       SELECT ?, account_id, -delta, 'refund', ref, ?
       FROM credit_ledger WHERE reason = 'report' AND ref = ?`,
    )
    .bind(crypto.randomUUID(), now(), ref)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @natalka/jobs test -- credits`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/pro/credits.ts apps/jobs/test/credits.test.ts
git commit -m "Count credits as a ledger that cannot go below zero"
```

---

### Task 5: Invite codes (`src/pro/invites.ts`)

**Files:**
- Create: `apps/jobs/src/pro/invites.ts`
- Test: `apps/jobs/test/invites.test.ts`

**Interfaces:**
- Consumes: `now` from `src/db.ts`; tables from Task 2; `balance` from Task 4 (tests only).
- Produces:
  - `type InviteResult = { status: 'granted'; credits: number } | { status: 'invalid' } | { status: 'already' }`
  - `redeemInvite(db: D1Database, accountId: string, rawCode: unknown): Promise<InviteResult>`
  - `hasRedeemed(db: D1Database, accountId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

`apps/jobs/test/invites.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { balance } from '../src/pro/credits';
import { hasRedeemed, redeemInvite } from '../src/pro/invites';
import { signIn, testEnv } from './env';

const db = () => testEnv.DB;
const seller = async (name: string) => (await signIn(`${name}@invites.test`)).account.id;

async function code(
  value: string,
  opts: { credits?: number; maxUses?: number; expiresAt?: string | null } = {},
) {
  await db()
    .prepare(
      'INSERT INTO pro_invite_codes (code, credits, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(value, opts.credits ?? 3, opts.maxUses ?? 100, opts.expiresAt ?? null, new Date().toISOString())
    .run();
}

const uses = async (value: string) =>
  (
    await db()
      .prepare('SELECT uses FROM pro_invite_codes WHERE code = ?')
      .bind(value)
      .first<{ uses: number }>()
  )?.uses;

describe('invite codes', () => {
  it('grants the trial credits', async () => {
    await code('WELCOME');
    const id = await seller('welcome');
    expect(await redeemInvite(db(), id, 'WELCOME')).toEqual({ status: 'granted', credits: 3 });
    expect(await balance(db(), id)).toBe(3);
    expect(await hasRedeemed(db(), id)).toBe(true);
    expect(await uses('WELCOME')).toBe(1);
  });

  it('accepts the code however it was typed', async () => {
    await code('ANNA2026');
    const id = await seller('typed');
    expect((await redeemInvite(db(), id, '  anna2026 ')).status).toBe('granted');
  });

  it('gives one invite per account, whichever code', async () => {
    await code('FIRSTCODE');
    await code('SECONDCODE');
    const id = await seller('greedy');
    await redeemInvite(db(), id, 'FIRSTCODE');
    expect(await redeemInvite(db(), id, 'FIRSTCODE')).toEqual({ status: 'already' });
    expect(await redeemInvite(db(), id, 'SECONDCODE')).toEqual({ status: 'already' });
    expect(await balance(db(), id)).toBe(3);
  });

  it('refuses unknown, empty, used-up and expired codes', async () => {
    await code('ONEUSE', { maxUses: 1 });
    await code('OLD', { expiresAt: '2000-01-01T00:00:00.000Z' });
    await redeemInvite(db(), await seller('early'), 'ONEUSE');
    const id = await seller('late');
    for (const bad of ['NOPE', '', '   ', 42, 'ONEUSE', 'OLD']) {
      expect(await redeemInvite(db(), id, bad)).toEqual({ status: 'invalid' });
    }
    expect(await balance(db(), id)).toBe(0);
    expect(await hasRedeemed(db(), id)).toBe(false);
  });

  it('never hands out the last use twice', async () => {
    await code('LASTONE', { maxUses: 1 });
    const [a, b] = [await seller('race-a'), await seller('race-b')];
    const results = await Promise.all([redeemInvite(db(), a, 'LASTONE'), redeemInvite(db(), b, 'LASTONE')]);
    expect(results.filter((r) => r.status === 'granted')).toHaveLength(1);
    expect(await uses('LASTONE')).toBe(1);
  });

  it('does not double-grant when one seller taps twice', async () => {
    await code('DOUBLETAP');
    const id = await seller('double');
    const results = await Promise.all([redeemInvite(db(), id, 'DOUBLETAP'), redeemInvite(db(), id, 'DOUBLETAP')]);
    expect(results.filter((r) => r.status === 'granted')).toHaveLength(1);
    expect(await balance(db(), id)).toBe(3);
    expect(await uses('DOUBLETAP')).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @natalka/jobs test -- invites`
Expected: FAIL, "Cannot find module '../src/pro/invites'".

- [ ] **Step 3: Implement**

`apps/jobs/src/pro/invites.ts`:

```ts
/** Invite codes: how the marketer's sellers get their trial credits.
 *
 * Redeeming is one D1 batch, and a batch is one transaction:
 * 1. record the redemption, but only from a code that is live and not used up;
 * 2. count the use;
 * 3. book the credits.
 * Steps 2 and 3 read the row step 1 wrote, so if step 1 finds no live code, nothing happens. The
 * redemption's primary key is the account: a second redemption by the same seller, even a racing
 * one, fails the whole batch.
 */

import { now } from '../db';

export type InviteResult =
  | { status: 'granted'; credits: number }
  | { status: 'invalid' }
  | { status: 'already' };

export async function hasRedeemed(db: D1Database, accountId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS yes FROM pro_invite_redemptions WHERE account_id = ?')
    .bind(accountId)
    .first<{ yes: number }>();
  return Boolean(row);
}

export async function redeemInvite(
  db: D1Database,
  accountId: string,
  rawCode: unknown,
): Promise<InviteResult> {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!code) return { status: 'invalid' };
  if (await hasRedeemed(db, accountId)) return { status: 'already' };

  const ts = now();
  let inserted: D1Result | undefined;
  try {
    [inserted] = await db.batch([
      db
        .prepare(
          `INSERT INTO pro_invite_redemptions (account_id, code, credits, created_at)
           SELECT ?, code, credits, ? FROM pro_invite_codes
           WHERE code = ? AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .bind(accountId, ts, code, ts),
      db
        .prepare(
          `UPDATE pro_invite_codes SET uses = uses + 1
           WHERE code IN (SELECT code FROM pro_invite_redemptions WHERE account_id = ?)`,
        )
        .bind(accountId),
      db
        .prepare(
          `INSERT INTO credit_ledger (id, account_id, delta, reason, ref, created_at)
           SELECT ?, account_id, credits, 'trial', 'invite:' || account_id, ?
           FROM pro_invite_redemptions WHERE account_id = ?`,
        )
        .bind(crypto.randomUUID(), ts, accountId),
    ]);
  } catch (error) {
    // The same seller redeeming twice at once: the second batch hits the primary key and rolls back.
    if (String(error).includes('UNIQUE')) return { status: 'already' };
    throw error;
  }
  if (!inserted?.meta.changes) return { status: 'invalid' };

  const row = await db
    .prepare('SELECT credits FROM pro_invite_redemptions WHERE account_id = ?')
    .bind(accountId)
    .first<{ credits: number }>();
  return { status: 'granted', credits: row?.credits ?? 0 };
}
```

The step-2 UPDATE has no `uses < max_uses` guard of its own. Step 1 already checked it in the same transaction, and SQLite serialises writers, so a second seller's batch sees the incremented `uses`. The race test above pins this.

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --filter @natalka/jobs test -- invites`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/jobs/src/pro/invites.ts apps/jobs/test/invites.test.ts
git commit -m "Invite codes that grant trial credits once per seller"
```

---

### Task 6: Sign-in letter and `/v1/pro` routes

**Files:**
- Modify: `apps/jobs/src/mail.ts` (add `sendLoginLink`)
- Create: `apps/jobs/src/pro/routes.ts`
- Modify: `apps/jobs/src/index.ts` (mount), `apps/jobs/wrangler.jsonc` (`PRO_SITE_URL`)
- Test: `apps/jobs/test/routes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces: `handlePro(request: Request, env: Env, url: URL): Promise<Response | null>`, which returns null for paths outside `/v1/pro/`. HTTP contract (consumed by Phase 5 web):
  - `POST /v1/pro/login` `{ email }`: 202 `{ ok: true }` for any valid address, known or not; 400 `{ error: 'email' }` otherwise.
  - `POST /v1/pro/session` `{ token }`: 200 `{ session, account: { email, tone } }`; 400 `{ error: 'link expired' }`.
  - `GET /v1/pro/me` (Bearer): 200 `{ email, tone, balance, invite_redeemed }`.
  - `POST /v1/pro/invite` (Bearer) `{ code }`: 200 `{ credits, balance }`; 404 `{ error: 'invalid code' }`; 409 `{ error: 'already redeemed' }`.
  - `POST /v1/pro/logout` (Bearer): 200 `{ ok: true }`. Ends every session of the account.
  - Any other `/v1/pro/*` route: 401 without a session, 404 with one.
  - The sign-in link is `${PRO_SITE_URL}/login/${token}`. Phase 5 makes that page POST the token, never GET it.

- [ ] **Step 1: Write the failing tests**

`apps/jobs/test/routes.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createLoginToken } from '../src/pro/auth';
import { testEnv } from './env';

const call = (method: string, path: string, body?: unknown, session?: string) =>
  SELF.fetch(`https://jobs.test${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(session ? { authorization: `Bearer ${session}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

async function sessionFor(email: string): Promise<string> {
  const token = await createLoginToken(testEnv.DB, email);
  const response = await call('POST', '/v1/pro/session', { token });
  expect(response.status).toBe(200);
  return ((await response.json()) as { session: string }).session;
}

describe('/v1/pro', () => {
  it('accepts a sign-in request for a new and a known address alike', async () => {
    await sessionFor('known@routes.test');
    for (const email of ['known@routes.test', 'stranger@routes.test']) {
      const response = await call('POST', '/v1/pro/login', { email });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it('rejects a bad address and a body that is not JSON', async () => {
    expect((await call('POST', '/v1/pro/login', { email: 'nope' })).status).toBe(400);
    expect((await call('POST', '/v1/pro/login', '{not json')).status).toBe(400);
  });

  it('never spends a sign-in token on a GET', async () => {
    const token = (await createLoginToken(testEnv.DB, 'scanner@routes.test')) as string;
    const scanned = await SELF.fetch(`https://jobs.test/v1/pro/session?token=${token}`);
    expect(scanned.status).not.toBe(200);
    expect((await call('POST', '/v1/pro/session', { token })).status).toBe(200);
  });

  it('refuses a spent token', async () => {
    const token = await createLoginToken(testEnv.DB, 'spent@routes.test');
    await call('POST', '/v1/pro/session', { token });
    const again = await call('POST', '/v1/pro/session', { token });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'link expired' });
  });

  it('shows the seller their balance and invite state', async () => {
    const session = await sessionFor('me@routes.test');
    const me = await call('GET', '/v1/pro/me', undefined, session);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      email: 'me@routes.test',
      tone: 'vy',
      balance: 0,
      invite_redeemed: false,
    });
  });

  it('redeems an invite and reports the new balance', async () => {
    await testEnv.DB.prepare(
      "INSERT INTO pro_invite_codes (code, credits, max_uses, created_at) VALUES ('ROUTES3', 3, 10, '2026-10-03T00:00:00.000Z')",
    ).run();
    const session = await sessionFor('invited@routes.test');
    const first = await call('POST', '/v1/pro/invite', { code: 'routes3' }, session);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ credits: 3, balance: 3 });
    expect((await call('POST', '/v1/pro/invite', { code: 'ROUTES3' }, session)).status).toBe(409);
    expect((await call('POST', '/v1/pro/invite', { code: 'NOSUCH' }, session)).status).toBe(409);
  });

  it('answers an unknown code with 404 for a seller who has none yet', async () => {
    const session = await sessionFor('wrongcode@routes.test');
    expect((await call('POST', '/v1/pro/invite', { code: 'NOSUCH' }, session)).status).toBe(404);
  });

  it('signs out everywhere', async () => {
    const session = await sessionFor('leaving@routes.test');
    expect((await call('POST', '/v1/pro/logout', {}, session)).status).toBe(200);
    expect((await call('GET', '/v1/pro/me', undefined, session)).status).toBe(401);
  });

  it('answers 401 without a session and with a forged one', async () => {
    expect((await call('GET', '/v1/pro/me')).status).toBe(401);
    expect((await call('GET', '/v1/pro/me', undefined, 'a.b.c')).status).toBe(401);
  });

  it('leaves the B2C routes alone', async () => {
    expect((await SELF.fetch('https://jobs.test/health')).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @natalka/jobs test -- routes`
Expected: FAIL, the `/v1/pro/*` routes answer 404 `not found`.

- [ ] **Step 3: Add the sign-in letter**

In `apps/jobs/src/mail.ts`, after `sendReady`:

```ts
/** The sign-in letter for Chronika Pro. Russian only for the pilot. */
const LOGIN_COPY: Copy = {
  subject: 'Вход в Chronika Pro',
  ready: 'Нажмите кнопку, чтобы войти в кабинет. Ссылка действует 15 минут и срабатывает один раз.',
  open: 'Войти в кабинет',
  keeps: 'Если вы не запрашивали вход, просто проигнорируйте это письмо — без ссылки в кабинет не попасть.',
  sign: 'Chronika Pro · pro.chronika.me',
  window: '',
  manage: '',
  unsubscribe: '',
};

export async function sendLoginLink(env: Env, to: string, link: string): Promise<Sent> {
  if (!env.RESEND_API_KEY) {
    // Local development only: production always has the key, and without it nobody could sign in.
    console.log('pro sign-in link (no mail provider configured):', link);
    return { status: 'skipped', providerId: null };
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: LOGIN_COPY.subject,
      html: html(LOGIN_COPY, link),
      text: `${LOGIN_COPY.ready}\n\n${link}\n\n${LOGIN_COPY.keeps}\n\n${LOGIN_COPY.sign}`,
    }),
  });
  if (!response.ok) {
    console.error('resend', response.status, (await response.text()).slice(0, 300));
    throw new Error(`mail provider answered ${response.status}`);
  }
  const data = (await response.json()) as { id?: string };
  return { status: 'sent', providerId: data.id ?? null };
}
```

- [ ] **Step 4: Write the routes**

`apps/jobs/src/pro/routes.ts`:

```ts
/** /v1/pro/* — the seller cabinet's API.
 *
 * Called only by the pro site's server; the browser never sees this worker. Every route but the
 * two sign-in steps needs a session.
 */

import type { Env } from '../env';
import { sendLoginLink } from '../mail';
import {
  authenticate,
  consumeLoginToken,
  createLoginToken,
  endSessions,
  issueSession,
  normalizeEmail,
  type ProAccount,
} from './auth';
import { balance } from './credits';
import { hasRedeemed, redeemInvite } from './invites';

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const readBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Always 202 for a well-formed address: the answer must not tell whether an account exists. */
async function requestLogin(request: Request, env: Env): Promise<Response> {
  const email = normalizeEmail((await readBody(request))?.email);
  if (!email) return json({ error: 'email' }, 400);
  const token = await createLoginToken(env.DB, email);
  if (token) {
    try {
      await sendLoginLink(env, email, `${env.PRO_SITE_URL}/login/${token}`);
    } catch {
      return json({ error: 'mail unavailable' }, 503);
    }
  }
  return json({ ok: true }, 202);
}

async function startSession(request: Request, env: Env): Promise<Response> {
  const token = (await readBody(request))?.token;
  const account = typeof token === 'string' ? await consumeLoginToken(env.DB, token) : null;
  if (!account) return json({ error: 'link expired' }, 400);
  return json({
    session: await issueSession(env, account),
    account: { email: account.email, tone: account.tone },
  });
}

async function me(env: Env, account: ProAccount): Promise<Response> {
  return json({
    email: account.email,
    tone: account.tone,
    balance: await balance(env.DB, account.id),
    invite_redeemed: await hasRedeemed(env.DB, account.id),
  });
}

async function invite(request: Request, env: Env, account: ProAccount): Promise<Response> {
  const result = await redeemInvite(env.DB, account.id, (await readBody(request))?.code);
  if (result.status === 'already') return json({ error: 'already redeemed' }, 409);
  if (result.status === 'invalid') return json({ error: 'invalid code' }, 404);
  return json({ credits: result.credits, balance: await balance(env.DB, account.id) });
}

export async function handlePro(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/v1/pro/')) return null;
  const route = `${request.method} ${url.pathname}`;

  // Only POST spends a sign-in token: mail scanners open links with GET.
  if (route === 'POST /v1/pro/login') return requestLogin(request, env);
  if (route === 'POST /v1/pro/session') return startSession(request, env);

  const account = await authenticate(request, env);
  if (!account) return json({ error: 'unauthorized' }, 401);

  if (route === 'GET /v1/pro/me') return me(env, account);
  if (route === 'POST /v1/pro/invite') return invite(request, env, account);
  if (route === 'POST /v1/pro/logout') {
    await endSessions(env.DB, account.id);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
```

- [ ] **Step 5: Mount it**

In `apps/jobs/src/index.ts`:
- add `import { handlePro } from './pro/routes';` next to the other local imports;
- in `fetch()`, directly before the final `return new Response('not found', { status: 404 });`, add:

```ts
    const pro = await handlePro(request, env, url);
    if (pro) return pro;
```

In `apps/jobs/wrangler.jsonc` `vars`, after `SITE_URL`:

```jsonc
    // The seller cabinet; sign-in letters link to it.
    "PRO_SITE_URL": "https://pro.chronika.me"
```

- [ ] **Step 6: Run everything**

Run: `pnpm --filter @natalka/jobs test`
Expected: all test files pass (health, schema, auth, credits, invites, routes).
Run: `pnpm --filter @natalka/jobs exec tsc --noEmit && pnpm exec biome check apps/jobs`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/jobs/src/mail.ts apps/jobs/src/pro/routes.ts apps/jobs/src/index.ts apps/jobs/wrangler.jsonc apps/jobs/test/routes.test.ts
git commit -m "Open /v1/pro: sign in, see your credits, redeem an invite"
```

---

### Task 7: Hand-over for deploy (owner steps, not run by the agent)

**Files:**
- Modify: `docs/chronika-pro/SPEC.md` (append an *Operations* section)

- [ ] **Step 1: Document the operator steps**

Append to `docs/chronika-pro/SPEC.md`:

````markdown
## Operations

Phase 1 deploy, done by the owner:

1. Session secret, a fresh random value that is never the same as `LINK_KEY`:
   `openssl rand -base64 48 | pnpm --filter @natalka/jobs exec wrangler secret put SESSION_KEY`
2. Remote migration (a production write): `pnpm --filter @natalka/jobs migrate`
3. Deploy: `pnpm --filter @natalka/jobs deploy`
4. Invite code for the marketer (until /admin exists):
   ```bash
   pnpm --filter @natalka/jobs exec wrangler d1 execute natalka --remote --command \
     "INSERT INTO pro_invite_codes (code, credits, max_uses, note, created_at)
      VALUES ('START3', 3, 50, 'marketer pilot', strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
   ```
````

- [ ] **Step 2: Commit**

```bash
git add docs/chronika-pro/SPEC.md
git commit -m "Say how Chronika Pro's first phase goes live"
```

---

## Self-review notes

- **Spec coverage (phase 1 slice):**
  - Open sign-up by magic link: Tasks 3 and 6.
  - Mail from chronika.me: Task 6.
  - Trial credits only through an invite, one per account: Task 5.
  - Credits never expire (no expiry column, no sweep): Tasks 2 and 4.
  - Weights: Task 4.
  - Automatic refund on failure: primitive in Task 4; Phase 2 wires it.
  - Tone stored per account: Task 2; Phase 3 consumes it.
  - Belongs to later phases: clients, brand, readings, packs, UI, admin, funnel counters.
- **Pitfall to watch in execution:** `@cloudflare/vitest-plugin` option names have changed between releases (it was formerly `@cloudflare/vitest-pool-workers` with `defineWorkersConfig`). Task 1 Step 3 says what to keep constant if names differ.
