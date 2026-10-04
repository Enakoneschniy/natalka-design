# Chronika Pro — Phase 5a: Sign-up, Sign-in and the Cabinet Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A seller registers on `pro.chronika.me` (email, name, optional invite code, accepted terms) and confirms the email by link. The account exists only after that.
- A registered seller signs in by a link. Unregistered addresses get no letter, and the answer is identical for both.
- The cabinet shell is in place: dark, calm, mobile first, with bottom tabs and the balance in the header. The tab content screens come in Phase 5b.

**Architecture:**
- **Jobs worker:**
  - Sign-in tokens gain a `purpose` (`login` / `signup`) and the sign-up details.
  - `POST /v1/pro/signup` is new.
  - `POST /v1/pro/login` sends only to existing accounts.
  - Consuming a sign-up token creates the account (name, terms time) and redeems the invite.
- **Web (`apps/web`, Next.js 16 on OpenNext Cloudflare):**
  - Middleware sends requests whose `Host` is a pro host to an internal `/pro/*` tree. That tree has its own root layout, so none of the B2C chrome, marketing tags or experiment cookies apply.
  - Server-side code talks to the jobs worker with `x-pro-key` (secret `PRO_API_KEY`) and the seller's session token.
  - The session token lives in an httpOnly cookie that only the pro host gets.

**Tech Stack:**
- `apps/jobs`: TypeScript, D1, Vitest via `@cloudflare/vitest-plugin`.
- `apps/web`: Next.js 16 App Router, React 19, plain CSS, Vitest (new, Node environment) for server-side helpers.

**Spec:** `docs/chronika-pro/SPEC.md` (*Access*, *Architecture*). Owner decisions of 2026-10-04:
- separate registration;
- confirm-email link;
- no letter to unregistered addresses;
- identical answer for any address;
- re-registering an existing email sends a sign-in link.

The sketches are at https://claude.ai/artifact/ADniUz3YvNz18nanj6WYrd (screens 0, 1 and the tab bar).

## Decisions made for this phase (controller; owner delegated)

- **Pro hosts** come from the env var `PRO_HOSTS`, a comma-separated list of exact `Host` header values. The default is `pro.chronika.me`. A dev box adds e.g. `astro:3000`. `chronika.me` stays the shop.
- **Paths on the pro host** map to the internal tree `src/app/pro/…`:

  | Path | Page |
  |---|---|
  | `/` | Отчёты |
  | `/clients` | Клиенты |
  | `/brand` | Бренд |
  | `/credits` | Кредиты |
  | `/signup` | Регистрация |
  | `/login` | Вход |
  | `/login/<token>` | Confirm page: one button "Войти" that POSTs the token, so mail scanners cannot spend it |

  API routes live under `src/app/api/pro/*` and answer **only** on a pro host (404 elsewhere).
- **Session cookie:** `chp_session`. httpOnly, Secure, SameSite=Lax, Path=/, no Domain attribute (host-only), Max-Age 30 days (equal to the jobs session TTL). Logout calls the jobs logout and clears the cookie.
- **Signed-out access:** a request for a protected page redirects to `/login`. A 401 from the jobs worker on any server call also clears the cookie and redirects to `/login`.
- **Copy (Russian):**
  - Answer after sign-in: «Если у этого адреса есть кабинет, ссылка придёт в течение минуты и будет действовать 15 минут.»
  - Answer after sign-up: «Мы отправили письмо со ссылкой. Кабинет откроется после перехода по ней.»
- **Sign-up fields:**
  - email;
  - `name` (1–60; it is also the default brand name the seller sees later);
  - `invite` (optional);
  - `terms` (must be `true`).

  The terms link points to `/terms` on the pro host. Phase 6 writes that page; for now it is a placeholder page that says the offer is being prepared.
- **Russia:** the RU country block applies to the pro host too, the same rewrite to `/unavailable`.
- **Indexing:** the pro host is always `noindex`.

## Global Constraints

- The B2C site behaves exactly as before on `chronika.me`: middleware behaviour, layout, cookies, routes.
- No auth libraries. No new runtime dependencies in `apps/web` except `vitest` as a dev dependency.
- The browser never sees `PRO_API_KEY` or the jobs URL. All jobs calls are server-side (route handlers and server components).
- The jobs worker keeps an identical answer (202 `{ok:true}`) for login and sign-up, whatever the account state.
- **Copy:** seller-facing text in Russian; code, comments and commits in English.
- **apps/web gate:**
  - `corepack pnpm exec biome ci .` at the repo root
  - `corepack pnpm --filter @natalka/web exec tsc --noEmit`
  - `corepack pnpm --filter @natalka/web test` (new)
  - `corepack pnpm --filter @natalka/web build`
- **apps/jobs gate:** `corepack pnpm --filter @natalka/jobs test` and `corepack pnpm --filter @natalka/jobs exec tsc --noEmit`.
- Commit messages are English outcome sentences ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `.devcontainer/docker-compose.yml`, `.gitignore` or `apps/jobs/.wrangler/`. Never run remote wrangler commands or deploy.

## Review Focus

1. **An unregistered address asks for a sign-in link.** Expected: 202, no letter, no token row. → Task 1 test.
2. **Someone registers an email that already has an account.** Expected: 202, a sign-in letter, no second account, and the existing name and terms stay unchanged. → Task 1 test.
3. **A sign-up link opened twice, or by a mail scanner (GET).** Expected: one account, and the GET does not consume it. → Task 1 and Task 4.
4. **`chronika.me/api/pro/…` or `chronika.me/pro/…` called on the shop host.** Expected: 404. Nothing of the cabinet is reachable from the shop host. → Task 2 and Task 3 tests.
5. **A session cookie that the jobs worker rejects** (expired, logged out elsewhere). Expected: the cookie is cleared and the visitor is sent to `/login`, with no error page. → Task 3 / Task 4.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/jobs/migrations/0012_pro_signup.sql` | token purpose and sign-up details; account name and terms time |
| `apps/jobs/src/pro/auth.ts` | `createLoginToken` (registered only), `createSignupToken`, consume handles both purposes |
| `apps/jobs/src/pro/routes.ts` | `POST /v1/pro/signup`; login only for registered accounts; `me` adds `name` |
| `apps/jobs/src/mail.ts` | `sendSignupLink` |
| `apps/web/vitest.config.ts`, `apps/web/package.json` | Node-environment unit tests for server helpers |
| `apps/web/src/lib/pro/host.ts` | `isProHost(host, env)` |
| `apps/web/src/lib/pro/session.ts` | cookie name and options; `readSession()` |
| `apps/web/src/lib/pro/client.ts` | server-only jobs `/v1/pro/*` client |
| `apps/web/src/middleware.ts` | pro-host branch before everything else |
| `apps/web/src/app/pro/layout.tsx`, `src/styles/pro.css` | the pro root layout and its styles |
| `apps/web/src/app/pro/(cabinet)/layout.tsx` | signed-in shell: header with balance, bottom tabs, redirect when signed out |
| `apps/web/src/app/pro/(cabinet)/{page,clients/page,brand/page,credits/page}.tsx` | tab pages (Phase 5a placeholders) |
| `apps/web/src/app/pro/{signup,login,login/[token],terms}/page.tsx` | public pages |
| `apps/web/src/app/api/pro/{signup,login,session,logout}/route.ts` | form endpoints |
| `apps/web/wrangler.jsonc`, `cloudflare-env.d.ts` | `pro.chronika.me` custom domain, `PRO_HOSTS` var, typed env |

---

### Task 1: Jobs worker: registration, and sign-in only for the registered

**Files:**
- Create: `apps/jobs/migrations/0012_pro_signup.sql`
- Modify: `apps/jobs/src/pro/auth.ts`, `apps/jobs/src/pro/routes.ts`, `apps/jobs/src/mail.ts`
- Test: `apps/jobs/test/signup.test.ts` (new); adjust `apps/jobs/test/routes.test.ts` where a test expects a sign-in letter for an unknown address.

**Interfaces:**
- Migration:

```sql
-- Chronika Pro, phase 5a: a seller registers first and confirms the address; only then is there an
-- account to sign in to. A sign-in link is never sent to an address without one.

ALTER TABLE pro_login_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login','signup'));
-- What the seller typed at sign-up, kept with the token until the address is confirmed.
ALTER TABLE pro_login_tokens ADD COLUMN signup_name TEXT;
ALTER TABLE pro_login_tokens ADD COLUMN signup_invite TEXT;

ALTER TABLE pro_accounts ADD COLUMN name TEXT;
-- When the seller accepted the offer, at sign-up. NULL for accounts created before sign-up existed.
ALTER TABLE pro_accounts ADD COLUMN terms_accepted_at TEXT;
```

- `auth.ts`:
  - `ProAccount` gains `name: string | null`; `ACCOUNT_COLUMNS` gains `name`.
  - `createLoginToken(db, email)` keeps its signature and throttle and writes `purpose='login'`. It is unchanged for callers, since tests use it to make sessions.
  - New `accountExists(db, email): Promise<boolean>`.
  - New `createSignupToken(db, email, { name, invite }): Promise<string | null>`. Same throttle (shared count per email per hour), `purpose='signup'`, and stores `signup_name` and `signup_invite` (upper-cased and trimmed, or null).
  - `consumeLoginToken(db, raw)`:
    - `UPDATE … RETURNING email, purpose, signup_name, signup_invite`.
    - For `signup`: `INSERT INTO pro_accounts (id, email, name, terms_accepted_at, created_at) … ON CONFLICT (email) DO NOTHING`, so an existing account keeps its name and terms. Then, if an invite was given **and** the account was just created, `redeemInvite(db, accountId, invite)`. Its failure is ignored, since the seller can enter a code later.
    - For `login`: the account must exist; return `null` if not, with no creation.
    - It still returns `ProAccount | null`.

  `redeemInvite` lives in `invites.ts`, which imports nothing from `auth.ts`, so there is no import cycle. Check before adding the import.
- `routes.ts`:
  - `POST /v1/pro/login {email}`: only when `accountExists`, create a login token and send the sign-in letter. Always answer 202 `{ok:true}`. Keep the existing 400 for a malformed email and 503 for a mail failure. The 503 happens only on the registered path; that is acceptable, since it reveals nothing that a mail outage does not already reveal.
  - `POST /v1/pro/signup {email, name, invite?, terms}`:
    - 400 `{error:'email'}`, `{error:'name'}` (1–60 after trim) or `{error:'terms'}` (unless `terms === true`);
    - then, if the account exists, send the **sign-in** letter for a login token; otherwise send the **confirm** letter for a sign-up token;
    - always 202 `{ok:true}`.
  - `GET /v1/pro/me` adds `name`.
  - Both new letters link to `${PRO_SITE_URL}/login/${token}`.
- `mail.ts`: `sendSignupLink(env, to, link)`, which follows `sendLoginLink` (same `deliver` helper, same dev log when no key). Copy:
  - subject «Подтвердите почту для Chronika Pro»;
  - body «Чтобы открыть кабинет, подтвердите адрес по ссылке ниже. Ссылка действует 15 минут.»;
  - button «Подтвердить и войти»;
  - footer line «Если вы не регистрировались, просто удалите это письмо».

- [ ] **Step 1: Failing tests** (`test/signup.test.ts`, through `SELF.fetch` with `x-pro-key: test-pro-key`, as in `routes.test.ts`):
  - **Login for an unknown address.** 202 `{ok:true}` and no `pro_login_tokens` row for that email.
  - **Login for a known address** (account made via the `signIn` helper). 202 and one new login token row.
  - **Sign-up for a new address** with `name: ' Мария '` and `invite: 'start3'` (seed `pro_invite_codes` with `START3`, 3 credits). 202, one `signup` token row with `signup_name='Мария'` and `signup_invite='START3'`, and no account yet. Consume via `POST /v1/pro/session {token}`: 200, the account has name Мария and `terms_accepted_at` set, and `GET /v1/pro/me` shows `balance: 3`, `invite_redeemed: true`, `name: 'Мария'`.
  - **Sign-up for an existing address** (account named «Старое»). 202, a `login`-purpose token, and after consuming it the name is still «Старое» and the account count for that email is 1.
  - **Sign-up validation.** `terms` missing or `'yes'` → 400 `terms`. Empty name → 400 `name`. Bad email → 400 `email`.
  - **A sign-up with an invalid invite code** still creates the account, with balance 0.
  - **A sign-up token consumed twice.** The second time it is 400 `link expired`.
  - **A login token whose account was deleted between request and click.** Consume returns 400. Create a token with `createLoginToken` for an email with no account to simulate it.

  Then adjust any existing test in `routes.test.ts` that expected a sign-in letter or token for an unknown address so it uses a registered one. Keep each test's intent and say which you changed.
- [ ] **Step 2: RED → implement → GREEN; full jobs suite; tsc.**
- [ ] **Step 3: Commit:** "Let a seller register and confirm their address, and send sign-in links only to sellers who have".

---

### Task 2: Web: unit tests, pro host detection, session cookie, jobs client

**Files:**
- Modify: `apps/web/package.json` (add `vitest` devDependency at the same major as `apps/jobs`, script `"test": "vitest run"`)
- Create: `apps/web/vitest.config.ts`, `apps/web/src/lib/pro/host.ts`, `apps/web/src/lib/pro/session.ts`, `apps/web/src/lib/pro/client.ts`
- Test: `apps/web/src/lib/pro/host.test.ts`, `apps/web/src/lib/pro/client.test.ts`
- Modify: `.github/workflows/ci.yml` web job (add `pnpm --filter @natalka/web test` after typecheck)

**Interfaces:**
- `vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- `host.ts`:

```ts
/** The cabinet answers on its own hosts; the shop answers everywhere else. */
export const DEFAULT_PRO_HOSTS = 'pro.chronika.me';

export function proHosts(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? DEFAULT_PRO_HOSTS)
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the request's Host header names a cabinet host. Compared exactly, port included. */
export function isProHost(host: string | null | undefined, raw = process.env.PRO_HOSTS): boolean {
  return Boolean(host) && proHosts(raw).has(String(host).trim().toLowerCase());
}
```

- `session.ts`:
  - `SESSION_COOKIE = 'chp_session'`
  - `SESSION_MAX_AGE = 30 * 24 * 60 * 60`
  - `sessionCookie(value: string)` returns the options object `{ name, value, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge }`
  - `clearedSessionCookie()` (same with `value: ''`, `maxAge: 0`)
  - `async function readSession(): Promise<string | null>`, reading via `cookies()` from `next/headers`
- `client.ts`: starts with `import 'server-only';`. If the `server-only` package is not installed, omit that line and add a comment; do not add the dependency.
  - Reads `process.env.NATALKA_JOBS_URL` and `process.env.PRO_API_KEY` and throws if either is missing.
  - `class ProUnauthorized extends Error {}`
  - `async function proCall<T>(path: string, init: { method?: string; body?: unknown; session?: string | null } = {}): Promise<{ status: number; data: T }>`:
    - sets `x-pro-key`, `content-type: application/json`, and `authorization: Bearer <session>` when a session is given;
    - throws `ProUnauthorized` on 401 **only when a session was sent**;
    - returns `{status, data}` otherwise, with `data` = parsed JSON or `null`.
  - Typed wrappers:
    - `requestLogin(email)`
    - `requestSignup({email,name,invite,terms})`
    - `startSession(token)` → `{ session, account } | null`
    - `me(session)` → `{ email, name, tone, balance, invite_redeemed }`
    - `logout(session)`

- [ ] **Step 1: Failing tests:**
  - `host.test.ts`:
    - the default matches `pro.chronika.me` but not `chronika.me`;
    - a custom list `pro.chronika.me, astro:3000` matches `ASTRO:3000` (case-insensitive) and not `astro:3001`;
    - null and undefined give false.
  - `client.test.ts` (stub `globalThis.fetch` with `vi.fn`, set the two env vars in `beforeEach`):
    - `proCall` sends `x-pro-key` and the bearer;
    - a 401 with a session throws `ProUnauthorized`;
    - a 401 without a session returns `{status:401}`;
    - `requestLogin` posts `{email}` to `/v1/pro/login`;
    - missing env throws a clear error.
- [ ] **Step 2: RED → implement → GREEN; web gate (biome, tsc, test). Commit:** "Give the web app what it needs to talk to the seller cabinet's API".

---

### Task 3: Web: the pro host gets its own tree, layout and shell

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Create:
  - `apps/web/src/app/pro/layout.tsx`
  - `apps/web/src/styles/pro.css`
  - `apps/web/src/app/pro/(cabinet)/layout.tsx`
  - `apps/web/src/app/pro/(cabinet)/page.tsx`
  - `apps/web/src/app/pro/(cabinet)/clients/page.tsx`
  - `apps/web/src/app/pro/(cabinet)/brand/page.tsx`
  - `apps/web/src/app/pro/(cabinet)/credits/page.tsx`
  - `apps/web/src/app/pro/terms/page.tsx`
  - `apps/web/src/components/pro/Tabs.tsx` (client; highlights the active tab via `usePathname`)
- Test: `apps/web/src/middleware.test.ts`

**Behaviour:**
- **Middleware**, first thing after the RU block:
  - When `isProHost(request.headers.get('host'))`, return `NextResponse.rewrite(new URL('/pro' + pathname + search, request.url))` with `x-robots-tag: noindex, nofollow`. No intl, no experiment cookie, no source cookie.
  - On a **non-pro** host, any path starting `/pro` returns `NextResponse.rewrite(new URL('/_not-found', request.url))`, or another way Next 16 offers to answer 404 from middleware. Check the docs (Context7 `/vercel/next.js`) and choose. The shop's own paths are unchanged.
  - The matcher stays as is. API routes are excluded from middleware; they check the host themselves (Task 4).
- **`app/pro/layout.tsx`** is a **root layout**: its own `<html lang="ru">` and `<body className="pro">`.
  - Google Fonts link for Playfair Display, Golos Text and JetBrains Mono, the same URL family as the shop.
  - Imports `@/styles/pro.css` only. No `globals.css`, no `Sky`, no `Marketing`, no next-intl provider.
  - Metadata: `robots: { index: false, follow: false }`, title template `%s — Chronika Pro`.

  Before relying on it, verify that Next 16 allows two root layouts side by side (`app/[locale]/layout.tsx` and `app/pro/layout.tsx`, with no `app/layout.tsx`). It does in the App Router (multiple root layouts). Run `next build` to confirm.
- **`pro.css`:** the tokens and component classes of the sketch, copied from the published sketch. Structure: tokens on `:root`, then `.btn`, `.btn.ghost`, `.btn.small`, `.input`, `.field`, `.card`, `.item`, `.pill.*`, `.tabs`, `.bar`, `.screen`. Do not import Tailwind; this file is plain CSS. Keep the phone-first widths: the content column is max 560px and centred, and at ≥ 720px the tab bar moves to a top bar. Respect `prefers-reduced-motion`.
- **`(cabinet)/layout.tsx`** (server component):
  - `readSession()`; if none, `redirect('/login')`.
  - `me(session)`; on `ProUnauthorized`, `redirect('/logout?expired=1')`. A server component cannot clear cookies; the logout route does that (Task 4).
  - Renders the header (`Chronika PRO` mark, name, balance pill «N кредитов»), `{children}` and `<Tabs/>`. Tabs: Отчёты `/`, Клиенты `/clients`, Бренд `/brand`, Кредиты `/credits`.
- **Tab pages** for 5a:
  - Each has a heading and an empty-state card «Этот раздел появится в следующем обновлении кабинета».
  - **Кредиты** additionally shows the balance from `me`.
  - **Отчёты** additionally shows «Пример готового разбора» as a disabled card, until Phase 5b wires the demo.
- **`/terms`:** heading «Условия работы» and the text «Оферта готовится. Пока действуют условия, о которых мы договорились при подключении.»

- [ ] **Step 1: Failing test** (`middleware.test.ts`). Import `middleware` and call it with `new NextRequest(url, { headers: { host } })`:
  - **Pro host `/clients`:** the response is a rewrite to `/pro/clients`. Check the `x-middleware-rewrite` header contains `/pro/clients`, and `x-robots-tag` is noindex.
  - **Shop host `/pro/clients`:** not a rewrite to `/pro/...` (a 404 answer).
  - **Shop host `/ru`:** unchanged behaviour (no `/pro` rewrite).
  - **Pro host with `cf-ipcountry: RU`:** rewrite to `/unavailable`.

  If Vitest cannot import the middleware because of the `@/` alias or next-intl ESM, fix the Vitest config (`server.deps.inline` for `next-intl`). Do not change production code to suit the test.
- [ ] **Step 2: RED → implement → GREEN; the full web gate including `build`. Commit:** "Give the seller cabinet its own host, layout and tabs".

---

### Task 4: Web: sign-up, sign-in, the confirm page and sign-out

**Files:**
- Create:
  - `apps/web/src/app/pro/signup/page.tsx`
  - `apps/web/src/app/pro/login/page.tsx`
  - `apps/web/src/app/pro/login/[token]/page.tsx`
  - `apps/web/src/components/pro/SignupForm.tsx` (client)
  - `apps/web/src/components/pro/LoginForm.tsx` (client)
  - `apps/web/src/app/api/pro/signup/route.ts`
  - `apps/web/src/app/api/pro/login/route.ts`
  - `apps/web/src/app/api/pro/session/route.ts`
  - `apps/web/src/app/pro/logout/route.ts` (a GET route handler inside the pro tree, reached as `/logout` on the pro host through the middleware rewrite)
  - `apps/web/src/lib/pro/guard.ts`
- Test: `apps/web/src/app/api/pro/routes.test.ts`

**Behaviour:**
- `guard.ts`: `notOnProHost(request: Request): Response | null` returns a 404 `Response` unless `isProHost(request.headers.get('host'))`. Every `api/pro/*` handler calls it first.
- **`POST /api/pro/signup`** (JSON `{email, name, invite, terms}`): guard, then `requestSignup` (Task 2 client). It passes 400 `{error}` through from jobs and maps anything else to 202 `{ok:true}`; a jobs 5xx becomes 503 `{error:'unavailable'}`.
- **`POST /api/pro/login`** (`{email}`): guard, then `requestLogin`. Same mapping.
- **`POST /api/pro/session`** (`{token}`): guard, then `startSession`. On success, `NextResponse.json({ok:true})` with `cookies.set(sessionCookie(session))`. On failure, 400 `{error:'link expired'}`.
- **`GET /logout`** (pro tree route handler): reads the session, calls `logout(session)` if present (ignoring errors), clears the cookie, and redirects to `/login` (with `?expired=1` passed through).
- **Pages** (Russian copy from the sketch; class names from `pro.css`):
  - **`/signup`:** `SignupForm` with email, «Имя или название бренда», «Инвайт-код (если есть)» and a checkbox «Принимаю [условия оферты](/terms) и обработки данных».
    - Submit posts to `/api/pro/signup`. Client-side checks: required email and name, checkbox ticked.
    - On 202, show the success card «Подтвердите почту»; on 400, show the field error.
    - Link «Уже есть кабинет? Войти».
  - **`/login`:** `LoginForm` with an email field and «Прислать ссылку для входа».
    - On 202, show «Проверьте почту — Если у этого адреса есть кабинет, ссылка придёт в течение минуты и будет действовать 15 минут.»
    - With `?expired=1`, a muted note «Сессия закончилась, войдите снова.»
    - Link «Нет кабинета? Зарегистрироваться».
  - **`/login/[token]`:** a page with the heading «Вход в кабинет» and one button «Войти». It **does not** consume the token on render. A small client component posts `{token}` to `/api/pro/session` and on `ok` does `location.assign('/')`. On error it shows «Ссылка устарела или уже использована» with a link to `/login`.
  - Both auth pages redirect to `/` when a session cookie is already present and `me` succeeds.

- [ ] **Step 1: Failing tests** (`routes.test.ts`). Import the route handlers directly. Stub `fetch` to answer the jobs URL. Build requests with `new Request('https://pro.chronika.me/api/pro/…', { headers: { host: 'pro.chronika.me' } })`:
  - **Signup:** 202 passes through, and the forwarded body includes `terms:true`.
  - **Signup on the shop host:** 404.
  - **Session:** success sets the `chp_session` cookie with HttpOnly, Secure, SameSite=Lax and Max-Age; failure gives 400 and no cookie.
  - **Login:** the jobs 202 maps to 202 `{ok:true}`; a jobs 503 maps to 503.
- [ ] **Step 2: RED → implement → GREEN; full web gate including build. Commit:** "Let a seller register, confirm, sign in and sign out of the cabinet".

---

### Task 5: Configuration and how to try it

**Files:**
- Modify:
  - `apps/web/wrangler.jsonc`: add the route `{ "pattern": "pro.chronika.me", "custom_domain": true }` and the var `"PRO_HOSTS": "pro.chronika.me"`, each with a one-line comment in the file's style.
  - `apps/web/cloudflare-env.d.ts`: add `PRO_HOSTS: string` and `PRO_API_KEY: string` to the env interface by hand. Do not run `wrangler types`, which needs auth.
  - `docs/chronika-pro/SPEC.md` → Operations.
  - `apps/web/README.md` or the closest existing dev doc, if one exists; otherwise only SPEC.

- [ ] **SPEC Operations, Phase 5a:**
  - apply migration `0012_pro_signup.sql` (a production write);
  - deploy the jobs worker before the web app;
  - set the web secret `PRO_API_KEY` to the same value as the jobs worker's (`wrangler secret put PRO_API_KEY` in `apps/web`);
  - deploying the web app creates the `pro.chronika.me` custom domain;
  - the jobs var `PRO_SITE_URL` is already `https://pro.chronika.me`.
  - Local try-out:
    - run `apps/web` with `PRO_HOSTS=astro:3000` to see the cabinet at that host;
    - set `NATALKA_JOBS_URL` to a jobs dev instance and `PRO_API_KEY`;
    - without a mail key, the jobs worker logs the link (dev only).
- [ ] **Web gate (build included). Commit:** "Serve the cabinet on pro.chronika.me, and write down how to bring it up".

## Self-review notes

**Spec coverage (5a):**

| Item | Task |
|---|---|
| Separate registration with terms and invite | 1 and 4 |
| Confirm by link | 1 and 4 |
| No letter to unregistered addresses; identical answer | 1 |
| Existing email at sign-up → sign-in letter | 1 |
| Host routing, own layout, noindex, RU block | 3 |
| Session cookie | 2 and 4 |
| Tabs shell with balance | 3 |

Clients, readings, brand and credit screens are deferred to 5b.

**Known limits:** the 5a tab pages are placeholders. Live check by the owner after deploy, as agreed.
