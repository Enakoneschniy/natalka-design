# Chronika Pro — Phase 5b: The Cabinet Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the cabinet's four tabs with the real screens from the sketches.
- **Clients:** list, card, new client with city search, delete.
- **Readings:** list, order, read by section with read / rewrite / fill / report a problem, assemble and download the PDF, the sample.
- **Brand:** form, logo and photo, colour with a cover preview, «ты/вы».
- **Credits:** balance, packs, Stripe checkout, history, invite code.

**Architecture:**
- **Data:** server components fetch through `src/lib/pro/client.ts` with the session cookie. Browser interactions go through **one** authenticated proxy route, `src/app/api/pro/x/[...path]/route.ts`. It forwards an **allowlisted** set of `/v1/pro/*` calls to the jobs worker, passing JSON, PDF and image bodies through. It reuses the 5a guards: pro host, plus same-origin and JSON for mutations, with an exception for image uploads.
- **Jobs worker:**
  - gains «Сообщить о проблеме» (stored in D1, logged);
  - validates the client birth-date range: 1900-01-01 up to today.
- **UI:** plain CSS in `src/styles/pro.css`, matching the published sketch. Client components only where the screen is interactive.

**Tech Stack:** Next.js 16 App Router (server and client components, route handlers), React 19, plain CSS, Vitest (Node) for pure helpers and route handlers. On the jobs side: Cloudflare Worker, D1, Vitest via `@cloudflare/vitest-plugin`.

**Spec:** `docs/chronika-pro/SPEC.md`.

The sketches are at https://claude.ai/artifact/ADniUz3YvNz18nanj6WYrd. Local HTML: `/tmp/claude-1000/-workspace-astro/c8cb362d-67ca-5bf9-8d41-ff73bed10dc0/scratchpad/chronika-pro-sketches.html` (if missing, use the published link).

**Jobs API reference:** `apps/jobs/src/pro/routes.ts` and the Phase 2–4 plans in `docs/superpowers/plans/`.

## Decisions made for this phase (controller; owner delegated)

- **Proxy allowlist.** Method + path pattern, nothing else:

  | Path | Methods |
  |---|---|
  | `clients` | GET, POST |
  | `clients/:id` | GET, DELETE |
  | `readings` | GET, POST |
  | `readings/:id` | GET |
  | `readings/:id/sections/:sid/regenerate` | POST |
  | `readings/:id/sections/:sid/report` | POST |
  | `readings/:id/pdf` | GET (PDF stream), POST |
  | `demo` | GET |
  | `brand` | GET, PUT |
  | `brand/logo`, `brand/photo` | GET (image stream), PUT (raw image), DELETE |
  | `purchases` | GET, POST |
  | `me` | GET |
  | `invite` | POST |

  Ids are matched by `[A-Za-z0-9-]+`. Anything else → 404 without calling jobs.
- **Proxy guards:**
  - Every method: pro host. GET/HEAD need nothing more.
  - POST/PUT/DELETE: same-origin (`Sec-Fetch-Site` or `Origin`, as in 5a's `notSameOrigin`).
  - JSON content-type is required, **except** `PUT brand/logo|photo`. Those accept `image/png` or `image/jpeg` and refuse a `content-length` over 1 048 576 (413) before forwarding.
  - A 401 from jobs → 401 `{error:'signed out'}`; the client redirects to `/login?expired=1`.
- **Polling.** While a reading is `writing`, its page polls `GET readings/:id` every 5 s and stops on `ready` or `failed`. While its PDF is `building`, the same.
- **Rewrite UX.** A rewrite blocks only its own section. A spinner shows «Переписываем… ~30 секунд». On `busy` or `limit` or `frozen`, a clear Russian message:
  - `limit`: «Переписывать больше нельзя: использованы все 10 попыток»;
  - `frozen`: «Срок правок закончился»;
  - `busy`: «Раздел уже переписывается, подождите».
- **Report a problem** (jobs): `POST /v1/pro/readings/:id/sections/:sid/report {comment}`. The comment is 1–1000 characters after trim. The report is stored in a new `pro_reports` table and logged with `console.warn`. The reply is 201 `{ok:true}`. Each seller may send at most 20 reports per hour, tracked in the same table, else 429. Telegram alerts and the admin listing come in Phase 6.
- **Birth-date range** (jobs `parseClientBirth`): the date must lie between `1900-01-01` and today (UTC). The client form shows the same rule.
- **City search:** the existing `/api/cities?q=` (D1) works on the pro host because `/api/*` bypasses middleware. The new-client form uses it and keeps `latitude`, `longitude` and `zone` from the chosen city. The date input mask helpers `maskDate`, `maskTime` and `cityLabel` are imported from `src/components/PersonFields.tsx`. The `PersonFields` component itself is not reused; it depends on next-intl, which the pro tree does not load.
- **Gender mapping:** the web uses `female | male | neutral` labels; jobs wants `f | m | n`.
- **Sample reading:** `/example` renders `GET demo`, which gives sections only. It is linked from the Отчёты tab for everyone. If the demo is not configured (404), the card says «Пример появится скоро».
- **Credits checkout:** `POST purchases {pack}` → `checkout_url`, then `location.assign(checkout_url)`. On return (`/credits?purchase=<id>`), the page shows «Оплата обрабатывается…» and re-fetches until the purchase is `paid` (every 3 s, max 60 s).
- **Desktop:** at ≥ 720 px the 5a top bar applies. The reading screen may use two columns at ≥ 1000 px (section list | reading). Optional; do it only if cheap.

## Global Constraints

- The browser never sees `PRO_API_KEY` or the jobs URL. `lib/pro/client.ts`, `session.ts` and `current.ts` are never imported from a `'use client'` file.
- Seller-facing copy is Russian. Code, comments and commits are English.
- No new runtime dependencies.
- **Web gate:**
  - `corepack pnpm exec biome ci .` (repo root)
  - `corepack pnpm --filter @natalka/web exec tsc --noEmit`
  - `corepack pnpm --filter @natalka/web test`
  - `corepack pnpm --filter @natalka/web build`
- **Jobs gate:** `corepack pnpm --filter @natalka/jobs test` and `corepack pnpm --filter @natalka/jobs exec tsc --noEmit`.
- Commit messages are English outcome sentences ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage only your files (never `git add -A`). Never stage `.devcontainer/docker-compose.yml`, `.gitignore`, any `.wrangler` or `cloudflare-env.d.ts`. Never deploy.

## Review Focus

1. **The proxy forwards only allowlisted calls.** Path traversal (`x/../../v1/orders`), encoded slashes and unknown verbs → 404, and jobs is not called. → Task 2 tests.
2. **A cross-site form or a `text/plain` POST to the proxy** → 403/415, so a CSRF cannot spend credits or delete clients. → Task 2 tests.
3. **A seller double-taps «Заказать»** with one credit. Expected: one reading; the button disables while posting; the second gets «Недостаточно кредитов». → Task 4 (UI disables; jobs already atomic).
4. **Leaving a writing reading and coming back**, or many tabs open. Expected: polling stops on unmount and never runs two timers per page. → Task 4 (pure poll scheduler tested).
5. **An oversized or non-image upload.** Expected: refused before forwarding (413/415), and the jobs worker's own checks remain. → Task 2 tests.

---

### Task 1: Jobs: report a problem, and a sane birth-date range

**Files:**
- Create: `apps/jobs/migrations/0013_pro_reports.sql`, `apps/jobs/test/reports.test.ts`
- Modify: `apps/jobs/src/pro/routes.ts` (new route), `apps/jobs/src/pro/clients.ts` (date range)
- Possibly: `apps/jobs/src/pro/reports.ts` (new module: `fileReport`)

**Migration:**

```sql
-- Chronika Pro, phase 5b: what a seller flags in a reading. Kept for the owner to read (admin, phase 6).

CREATE TABLE pro_reports (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES pro_accounts(id),
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  comment    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX pro_reports_account ON pro_reports (account_id, created_at);
```

**Behaviour:**
- **The route** `POST /v1/pro/readings/:id/sections/:sid/report {comment}`:
  - The reading must be the seller's (`readingRow`), else 404.
  - The section must be in the reading's plan, else 404.
  - The comment is trimmed and must be 1–1000 characters, else 400 `{error:'comment'}`.
  - A seller with 20 or more reports in the last hour gets 429 `{error:'too many'}`.
  - Otherwise: insert, `console.warn('pro report', { account, order, section })` (never log the comment, which may contain client data), and reply 201 `{ok:true}`.
- **`parseClientBirth`:** reject a date before `1900-01-01` or after today (UTC).

- [ ] **Step 1:** Failing tests.
  - The report is stored.
  - Another seller's reading → 404.
  - An unknown section → 404.
  - An empty comment and a 1001-character comment → 400.
  - The 21st report in an hour → 429.
  - Deleting the client (and so the order) removes its reports through the cascade.
  - `parseClientBirth` rejects `1899-12-31` and tomorrow, and accepts `1900-01-01` and today.
- [ ] **Step 2:** RED, then implement, then GREEN. Run the jobs gate.
- [ ] **Commit:** "Let a seller flag a section, and keep birth dates within reason".

---

### Task 2: Web: the authenticated proxy for the cabinet's browser calls

**Files:**
- Create: `apps/web/src/lib/pro/allow.ts` (pure: `matchProxy(method, segments) → { path: string; kind: 'json' | 'pdf' | 'image' | 'image-upload' } | null`), `apps/web/src/app/api/pro/x/[...path]/route.ts`
- Test: `apps/web/src/lib/pro/allow.test.ts`, `apps/web/src/app/api/pro/x/route.test.ts`
- Modify: `apps/web/src/lib/pro/client.ts`, if a raw-fetch helper is needed that returns the jobs `Response` for streaming. Keep it server-only by convention.

**Behaviour:**
- `matchProxy` implements the allowlist from *Decisions*. It rejects:
  - empty segments;
  - `..` and `.`;
  - segments containing `/` or `%2F` after decoding;
  - ids not matching `[A-Za-z0-9-]+`;
  - unknown method and path pairs.
- **The route** exports GET, POST, PUT and DELETE, and runs these steps in order:
  1. pro host guard;
  2. for mutations, the same-origin guard, then the content-type rule by kind: JSON, or for `image-upload` `image/png`/`image/jpeg` with the 1 MB `content-length` cap (413);
  3. read the session cookie; none → 401 `{error:'signed out'}`;
  4. forward to jobs `/v1/pro/<path>` with `x-pro-key` and the bearer, passing the query string for GET;
  5. answer:
     - JSON kinds: pass the status and JSON body through, with a 401 → 401 `{error:'signed out'}`;
     - `pdf` and `image` GET: stream the body with the upstream `content-type`, `content-disposition` and `cache-control: private, no-store`;
     - `image-upload`: forward the raw body.
- [ ] **Step 1:** Failing tests.
  - `allow.test.ts`:
    - each allowlisted method and path pair;
    - traversal (`['..','orders']`);
    - an encoded slash;
    - a bad id;
    - `DELETE purchases` is null.
  - `route.test.ts` (fetch stubbed):
    - a shop host → 404;
    - cross-site POST → 403;
    - `text/plain` POST → 415;
    - no session → 401;
    - an allowlisted GET forwards the bearer and `x-pro-key` and passes the query;
    - jobs 401 → 401;
    - PDF stream passes `content-type: application/pdf`;
    - a logo PUT with `image/gif` → 415, and a `content-length` of 2 MB → 413, without fetch.
- [ ] **Step 2:** RED, then implement, then GREEN. Run the web gate.
- [ ] **Commit:** "Give the cabinet one guarded door to its API".

---

### Task 3: Web: Клиенты — list, card, new client, delete

**Files:**
- Create:
  - `apps/web/src/app/pro/(cabinet)/clients/page.tsx` (replace the placeholder; server)
  - `apps/web/src/app/pro/(cabinet)/clients/new/page.tsx`
  - `apps/web/src/app/pro/(cabinet)/clients/[id]/page.tsx`
  - `apps/web/src/components/pro/ClientForm.tsx` (client)
  - `apps/web/src/components/pro/CitySearch.tsx` (client)
  - `apps/web/src/components/pro/ClientSearch.tsx` (client, filters the rendered list by name)
  - `apps/web/src/components/pro/DeleteClient.tsx` (client, with an in-page confirm step; `confirm()` is not used)
  - `apps/web/src/lib/pro/birth.ts` (pure: parse `dd.mm.yyyy` and `hh:mm`, range check, gender map, build the jobs body)
- Test: `apps/web/src/lib/pro/birth.test.ts`

**Behaviour:**
- **List.** Avatar letter, name, `dd.mm.yyyy · hh:mm|время неизвестно · place`, «отчётов: N». Uses `GET clients` plus `GET readings` grouped by client. Or, if a reading count is not cheap, drop it and show the date only; decide by reading the jobs API.
  - Search filters client-side.
  - «+ Клиент» opens `/clients/new`.
  - Empty state: «Пока нет клиентов. Добавьте первого — это займёт минуту.»
- **New client form** (as sketch 4):
  - Name.
  - Date (`maskDate`).
  - Time (`maskTime`) with an «Время неизвестно» checkbox.
  - City: `CitySearch`, which calls `/api/cities?q=` (debounced 150 ms, aborts the previous request, keyboard-accessible combobox) and shows `lat · lon · zone` under the field once picked.
  - Gender segmented control (Женский / Мужской / Не указывать).
  - Consent checkbox.
  - Validation:
    - name 1–80;
    - the date is real and between 1900-01-01 and today;
    - the time is valid unless unknown;
    - a city is picked;
    - consent is ticked.

    Each error shows next to its field.
  - Submit posts JSON to `/api/pro/x/clients`. On 201 it goes to `/clients/<id>`; on 400 it shows the error; on 401 it goes to `/login?expired=1`.
- **Card** (`/clients/[id]`):
  - The details.
  - The readings list, the same item component as the Отчёты list.
  - «Новый отчёт» → `/readings/new?client=<id>`.
  - «Удалить клиента» with an inline confirm: «Удалить клиента и все его отчёты? Это нельзя отменить.» On confirm: `DELETE`, then `/clients`.
- [ ] **Step 1:** Failing tests (`birth.test.ts`):
  - date parse and range: `31.12.1899` rejected, `01.01.1900` accepted, tomorrow rejected, `30.02.2000` rejected;
  - time parse;
  - gender map;
  - the body builder produces exactly the jobs `ClientBirth` + `consent:true` shape, with `time:null` when unknown.
- [ ] **Step 2:** RED, then implement, then GREEN. Run the web gate.
- [ ] **Commit:** "Let a seller keep their clients in the cabinet".

---

### Task 4: Web: Отчёты — list, order, read and rewrite, PDF, sample

**Files:**
- Create:
  - `apps/web/src/app/pro/(cabinet)/page.tsx` (replace the placeholder: readings list plus sample card)
  - `apps/web/src/app/pro/(cabinet)/readings/new/page.tsx`
  - `apps/web/src/app/pro/(cabinet)/readings/[id]/page.tsx`
  - `apps/web/src/app/pro/(cabinet)/example/page.tsx`
  - `apps/web/src/components/pro/ReadingItem.tsx`
  - `apps/web/src/components/pro/OrderForm.tsx` (client)
  - `apps/web/src/components/pro/Reading.tsx` (client: sections, polling, rewrite, fill, report, PDF dock)
  - `apps/web/src/components/pro/ReportDialog.tsx` (client)
  - `apps/web/src/lib/pro/poll.ts` (pure scheduler)
  - `apps/web/src/lib/pro/readings.ts` (pure: product labels, status → pill, messages)
- Test: `apps/web/src/lib/pro/poll.test.ts`, `apps/web/src/lib/pro/readings.test.ts`

**Behaviour:**
- **List** (home tab):
  - Each item shows: avatar, «Имя · Продукт» (synastry: «Имя и Имя · Синастрия»), a status pill and a date. Statuses: пишется, готов, PDF готов, раздел не дописан, не удалось (refunded). While writing, the progress «N из M разделов» and a bar.
  - «+ Новый» → `/readings/new`.
  - The sample card → `/example`.
  - Empty state: «Здесь будут ваши разборы. Начните с клиента.»
- **Order** (`/readings/new?client=`):
  - The client picker (a select over the seller's clients) and five product cards with cost. Synastry reveals a «Партнёр» select (another client).
  - Balance after the order.
  - The «Заказать за N кредит(а/ов)» button disables while posting.
  - On 201 → `/readings/<id>`. On 402: «Недостаточно кредитов» with a link to `/credits`. On 400: the error.
- **Reading** (`/readings/[id]`):
  - Header: name, product, «переписать: X из 10 до <date>», or «правки закрыты» if frozen.
  - Sections in plan order. Each shows its title and the first 3 lines, then:
    - «Читать» expands the full text, which keeps paragraphs and `<b>/<i>` safely (render as text with paragraph splits; do not render HTML);
    - «Переписать» → POST regenerate, then replace the text, with the per-section spinner and the error messages from *Decisions*;
    - «⚑» opens `ReportDialog`, a textarea of up to 1000 characters that sends to report, then «Спасибо, посмотрим».
  - Missing sections are shown with the danger style and a «Дописать» button (same regenerate call).
  - **Dock:**
    - while writing: «Пишем разбор… N из M» with polling;
    - when ready and complete: «Собрать PDF» → POST pdf, then building with polling;
    - when the PDF is ready: «Скачать PDF · N стр.» linking `/api/pro/x/readings/<id>/pdf`;
    - with sections missing: a disabled button and «Сначала допишите: <titles>»;
    - when refunded: «Не удалось написать разбор. Кредиты вернулись на счёт.»
- **Sample** (`/example`): read-only sections from `GET demo`, with no actions, and the note «Так выглядит готовый разбор. В вашем PDF будет ваш бренд.»
- **`poll.ts`:** `createPoller({ intervalMs, tick, shouldStop, schedule = setTimeout, cancel = clearTimeout })` returns `{ start(), stop() }`.
  - It never runs two timers.
  - `stop` is idempotent.
  - It stops when `shouldStop(result)` holds.
  - Tests use fake schedule functions.
- [ ] **Step 1:** Failing tests:
  - poller: no double start; stop cancels; stops on a terminal state; keeps going on a failed tick with backoff (×2 up to 30 s);
  - `readings.ts`: status → pill mapping, including refunded; credit word forms for 1, 2 and 5.
- [ ] **Step 2:** RED, then implement, then GREEN. Run the web gate.
- [ ] **Commit:** "Let a seller order, read, rewrite and download their readings".

---

### Task 5: Web: Бренд

**Files:**
- Create:
  - `apps/web/src/app/pro/(cabinet)/brand/page.tsx` (replace the placeholder)
  - `apps/web/src/components/pro/BrandForm.tsx` (client)
  - `apps/web/src/components/pro/CoverPreview.tsx` (client)
  - `apps/web/src/components/pro/ImageField.tsx` (client)
- Test: `apps/web/src/lib/pro/brand.test.ts`, plus a pure `brand.ts`: accent palette, contrast warning, form → body

**Behaviour:**
- **Cover preview** at the top, as in the sketch:
  - a dark night background with a CSS/canvas wheel placeholder;
  - the brand name letter-spaced in the accent, or the logo image when uploaded;
  - the rule and diamond in the accent;
  - «Натальная карта», a sample client name, the date and the first contact.
- **Fields:**
  - name (1–60);
  - contacts (up to 4 lines, each 1–80; add and remove);
  - accent: 6 swatches plus a custom `#RRGGBB` input. If the accent's relative luminance is under 0.18, warn «Плохо видно на тёмной обложке»;
  - «Обращение к клиенту»: на «вы» / на «ты», with a sample sentence that changes;
  - intro and outro textareas (≤ 3000, with a counter);
  - signature (≤ 80).

  Save → PUT brand with the tone, then «Сохранено».
- **Images** (logo and photo):
  - file input (`accept="image/png,image/jpeg"`, client-side size check ≤ 1 MB);
  - upload via PUT raw bytes to `/api/pro/x/brand/<kind>` with the file's content-type;
  - preview from `GET`, and «Удалить».
  - Uploading before the brand is saved shows «Сначала сохраните имя бренда» (the jobs worker answers 409 `no_brand`).
- [ ] **Step 1:** Failing tests (`brand.test.ts`):
  - the luminance warning for `#3a2a1a` (warn) and `#E7B75C` (no warn);
  - form → body trims and drops empty contacts;
  - contacts over 4 refused.
- [ ] **Step 2:** RED, then implement, then GREEN. Run the web gate.
- [ ] **Commit:** "Let a seller set up their brand and see the cover change".

---

### Task 6: Web: Кредиты, and a fake jobs server for trying the cabinet locally

**Files:**
- Create:
  - `apps/web/src/app/pro/(cabinet)/credits/page.tsx` (replace the placeholder)
  - `apps/web/src/components/pro/BuyPack.tsx` (client)
  - `apps/web/src/components/pro/PurchaseStatus.tsx` (client)
  - `apps/web/src/components/pro/InviteForm.tsx` (client)
  - `apps/web/scripts/fake-pro-jobs.mjs`
- Modify: `docs/chronika-pro/SPEC.md` (Operations: how to try the cabinet locally)

**Behaviour:**
- **Credits page:**
  - the balance (big number plus noun) and the line «1 кредит = 1 отчёт · натал + прогноз = 2»;
  - three packs, each with its price and per-reading price; «Купить» → POST purchases → `location.assign(checkout_url)`. On 503: «Оплата временно недоступна».
  - history from `GET purchases`: status pill plus «можно вернуть до <paid_at + 14 days>» when `refundable`;
  - when `invite_redeemed` is false (from `me`), an inline «Есть инвайт-код?» form → POST invite: 200 «+3 кредита», 404 «Код не найден», 409 «Код уже использован».
  - With `?purchase=<id>`, `PurchaseStatus` shows «Оплата обрабатывается…» and polls (`lib/pro/poll.ts`, every 3 s, ≤ 60 s) until that purchase is paid, then «Кредиты зачислены» and a refresh.
- **`scripts/fake-pro-jobs.mjs`:** a dependency-free Node `http` server on port 8799. It answers the `/v1/pro/*` calls the cabinet makes with plausible in-memory data:
  - a seller with 12 credits;
  - 3 clients;
  - readings in each state, including one writing that advances on each GET;
  - a brand;
  - purchases.

  It accepts any `x-pro-key` and any bearer, plus `POST /v1/pro/session` with any token. It exists **only** for visual checks: `NATALKA_JOBS_URL=http://localhost:8799 PRO_API_KEY=dev PRO_HOSTS=localhost:3000`. Document this in SPEC Operations next to the 5a note.
- [ ] **Step 1:** The web gate. Then run `next build`, `next start` with the fake jobs server, and take phone-width screenshots of every tab plus a reading and the new-client form, via the Playwright server (`PW_TEST_CONNECT_WS_ENDPOINT`; reach the dev box as `http://astro:<port>` with `PRO_HOSTS` including it). The session cookie is `Secure`, so for screenshots set it through the Playwright context (`context.addCookies`) rather than by signing in. Save the screenshots to `/tmp/claude-1000/-workspace-astro/c8cb362d-67ca-5bf9-8d41-ff73bed10dc0/scratchpad/5b-*.png` and list them in the report.
- [ ] **Commit:** "Let a seller buy credits and enter an invite code, and make the cabinet easy to try locally".

## Self-review notes

- **Sketch coverage:**

  | Screen | Task |
  |---|---|
  | 2 — Отчёты | 4 |
  | 3 — Клиенты | 3 |
  | 4 — Новый клиент | 3 |
  | 5 — Новый отчёт | 4 |
  | 6 — Отчёт | 4 |
  | 7 — Бренд | 5 |
  | 8 — Кредиты | 6 |
- **Follow-ups from earlier phases:**
  - Birth-date range: Task 1 and Task 3.
  - Visible PDF-assembly failure: Task 4 shows `pdf: none` after a failed build with «Собрать PDF» available again. The reason (`last_error`) stays in the admin of Phase 6.
- **Not here (Phase 6):** admin, landing, Telegram alerts for reports, offer text, the pre-sale sweeps.
