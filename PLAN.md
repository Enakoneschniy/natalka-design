# Natalka — Development Plan

Status: **draft for owner review** (2026-09-28). No product code written yet beyond the `design/` mockups.
Owner decisions from the brief are treated as fixed and are not repeated here unless they affect a choice below.

## 0. What is in the repo today

| Path | What | Role going forward |
|---|---|---|
| `design/` | Claude Design export: 8 HTML screens, `tokens.css`, `base.css`, `wheel.js` (SVG chart renderer), `i18n/*.js` (12 languages), GSAP motion | **UI source of truth.** Tokens, layout and copy are ported into `apps/web`; the JS wheel becomes the reference for the Python SVG renderer. Kept as a static reference, not shipped. |
| `index.html`, `package.json` | GitHub Pages redirect + Playwright screenshot tooling | Move under `design/`; root `package.json` becomes the monorepo root. |
| *(missing)* `astro_build_pdf.py`, `astro_main_template.py`, `content_*.py`, `METHODOLOGY.md`, `STYLE_GUIDE.md` | Old «Астролог» pipeline | **Not in the repo.** Needed for: PDF styling reference (cover, QuoteBox, positions table), prompt methodology, forbidden-phrase list, and the `content_timeline.py` dates for the Kharkiv acceptance test. → Open question 1. |

## 1. Target layout

```
natalka/
├─ apps/
│  ├─ web/            Next.js 15 (App Router, TS, Tailwind 4, next-intl). Vercel-deployable.
│  └─ worker/         Python 3.12. Two processes from one image:
│                       `natalka-api`    — internal HTTP (FastAPI): /v1/calc (free preview), /v1/geocode, /v1/wheel.svg
│                       `natalka-worker` — queue consumer: calc → texts → pdf → email
├─ packages/
│  ├─ engine/         pure Python, no I/O except ephemeris files. pyswisseph imported ONLY in ephemeris.py.
│  ├─ document/       JSON document schema (pydantic) → ReportLab PDF; own SVG wheel renderer.
│  ├─ texts/          section prompts per language + LLM client + post-generation validator.
│  ├─ shared/         Python: settings, crypto (AES-GCM), db (sqlalchemy-core), models, telegram alerts.
│  └─ ui-tokens/      design tokens exported once (JSON) → Tailwind theme + ReportLab colour constants.
├─ infra/             docker-compose (Postgres 16 + api + worker), Dockerfiles, GitHub Actions.
├─ design/            static mockups (reference only).
└─ PLAN.md
```

Tooling: pnpm workspaces + Turborepo for JS; **uv** workspace for Python (one lockfile, `packages/*` as editable members). Lint/format: Biome (TS), Ruff + mypy --strict (Python). Tests: Vitest + Playwright (web), pytest (Python). CI: GitHub Actions matrix `web` / `python`, Postgres service container for worker tests.

## 2. Data model (draft — needs your confirmation, see Q3)

Only `sqlalchemy-core` tables + Alembic migrations. `drizzle` is not needed: the web app never writes to the DB directly (it calls the internal API), which keeps one migration tool and one place that knows the schema.

```
orders          id uuid pk · email · product enum · locale · amount_minor int · currency ·
                stripe_session_id · stripe_payment_intent · status (pending|paid|refunded) ·
                created_at · paid_at                                  ← kept forever (accounting)
charts          id uuid pk · order_id fk · person_no smallint (1|2 for synastry) ·
                birth_ciphertext bytea · birth_nonce bytea · key_version smallint ·
                unknown_time bool · gender enum · display_name text ·
                lat/lon/tz stored INSIDE the ciphertext · expires_at timestamptz   ← 30 days
jobs            id uuid pk · order_id fk · kind enum · step enum (calc|texts|pdf|email|done) ·
                status (queued|running|failed|done) · attempts int · run_after timestamptz ·
                last_error text · payload jsonb (engine JSON, section statuses) · locked_at/locked_by
documents       id uuid pk · order_id fk · storage_key text · sha256 · pages int · bytes int ·
                lang · expires_at timestamptz                        ← 30 days
email_events    id · order_id · kind · provider_id · status · created_at
access_tokens   none — JWT (HS256, 30 d, claims: order_id, email hash, jti); revocation by order status.
```

Retention job: nightly `DELETE FROM charts/documents WHERE expires_at < now()` + object storage delete; `orders` untouched. Key rotation: `key_version` column, `NATALKA_DATA_KEYS="v2:...,v1:..."`.

## 3. Stages

### Stage 1 — Skeleton (this session, after plan approval)
- Monorepo, uv + pnpm workspaces, Turborepo, Biome, Ruff/mypy, pytest, Vitest.
- `infra/docker-compose.yml`: Postgres 16; `.env.example` with every variable documented.
- GitHub Actions: lint · typecheck · pytest · vitest on push/PR.
- `packages/shared`: settings (pydantic-settings), AES-GCM helpers with tests, DB engine factory, migration 0001 (tables above).

### Stage 2 — Engine (this session)
- `ephemeris.py`: single pyswisseph boundary (`swe.calc_ut`, `swe.houses_ex`, `swe.set_sid_mode` untouched → tropical). README note on AGPL + Professional licence before public launch. Start with the built-in Moshier ephemeris (no data files, ~1″); switching to `sepl*.se1` files is a config flag.
- `chart.py`: `NatalInput(dt_utc, lat, lon, unknown_time)` → `NatalChart` dataclass: Sun…Pluto, Chiron, mean & true Node, Lilith (mean), Pars Fortunae (day/night formula), ASC/MC/cusps (Placidus; Porphyry fallback above ±66° latitude), retrograde flags, speed.
- `aspects.py`: majors (0/60/90/120/180) + minors (30/45/135/150) with per-planet orbs table (luminaries wider), applying/separating, exactness.
- `transits.py`: outer-planet ingresses and exact hits to natal points over a date range (root-finding on longitude difference) — this is what replaces "dates from the model's memory".
- `geo/`: GeoNames `cities500` subset (name + alternate names uk/ru/en/pl/de), Postgres FTS for autocomplete; `timezonefinder` → IANA zone; `zoneinfo` for historical offsets. Dedicated tests: Kharkiv 1986 (MSK+1 summer?), Yevpatoria 1994 (Ukraine on EET/EEST), Moscow-time period 1991–1992, Kyiv 1990–91 anomalies.
- Tests: Yevpatoria 15.05.1994 15:25 (Sun 24°24′ ♉, Moon 17°32′ ♋, ASC 20°34′ ♍, MC 18°34′ ♊); Kharkiv 15.03.1986 22:25 with the 2026 transit list; fixture loader for 50 Astro-Seek charts (CSV in `packages/engine/tests/fixtures/astroseek.csv`, see Q4).

### Stage 3 — Document (this session)
- `schema.py`: `Document{meta, cover, toc(auto), sections[{id, title, blocks[paragraph|subheading|quote|table|wheel|aspect-grid|page-break]}]}` as pydantic models + JSON Schema export. Texts are data, never code.
- `render/`: ReportLab: cover (dark, gold wheel), running headers/footers, TOC, styles ported from `astro_build_pdf.py` once available (until then: `design/tokens.css` + `design/pdf.html`). Fonts: Playfair Display, Golos Text, JetBrains Mono (OFL, vendored).
- `wheel.py`: SVG renderer, port of `design/wheel.js` (same radii, collision avoidance, aspect colours) → `svglib` → ReportLab drawing; the same SVG is served to the web preview so both surfaces are pixel-consistent.
- Test: render `examples/natal-uk.json` (Yevpatoria chart) → PDF with cover + positions + aspect grid + one text section; snapshot test on page count and text extraction.

### Stage 4 — Web (next session)
- Routes under `[locale]/`: `/` landing, `/start` form, `/preview/[id]`, `/checkout` (Stripe redirect), `/order/[token]`, `/legal/{terms,privacy,refunds}`, `/unavailable`.
- Preview flow: form → POST internal API `/v1/calc` (no DB write yet) → preview page renders from engine JSON (positions table, aspect grid, SVG wheel from API, 2–3 template paragraphs — deterministic, not LLM, for the free tier).
- Stripe Checkout (EUR, Stripe Tax, Adaptive Pricing); metadata = encrypted birth blob id; webhook `checkout.session.completed` → insert `orders`+`charts`+`jobs`, return 200 fast. Idempotent on `stripe_session_id`.
- Order page by JWT: status per step, download PDF (signed short-lived storage URL), upsell links.
- Geo/locale: middleware reads `CF-IPCountry`/`x-vercel-ip-country`; UA → `uk` and no `ru` in the switcher; RU → `/unavailable` (and Stripe session refused server-side).
- Port `design/` visual system to Tailwind + React: wheel via `<img src=/v1/wheel.svg?...>` or inline SVG from API; motion with GSAP (already licensed free) behind `prefers-reduced-motion`.

### Stage 5 — Worker (next session)
- Queue on Postgres `jobs` with `FOR UPDATE SKIP LOCKED`, visibility timeout by `locked_at`, exponential retry (max 5), dead-letter = `failed` + Telegram alert with order id and step.
- Steps as pure functions `(job, ctx) -> payload`: `calc` (engine → JSON stored in `payload`), `texts` (per section, parallel with concurrency limit, validator loop), `pdf` (document → storage), `email` (provider API, PDF attached ≤ 10 MB else link only).
- Cleanup job (30-day retention), health endpoint, structured logging (JSON), Sentry optional.

### Stage 6 — Texts (next session)
- `packages/texts/prompts/{uk,en}/*.md`: system prompt from METHODOLOGY.md + STYLE_GUIDE.md (with the "insider info" block and real-world events removed), one prompt per section with a strict JSON output schema.
- Input = engine JSON only (positions, aspects, houses, transit events with ISO dates). The model is told it may not infer any date or position itself.
- Validator: every planet/sign/house/date mentioned must exist in the input JSON (regex + sign/planet lexicon per language), length bounds, banned phrases, language detection; fail → regenerate with the validator report as feedback, max 3 tries, then alert.
- Model: Claude (default `claude-sonnet-5` for cost; `claude-opus-5` behind a flag for the core sections). Prompt caching for the system prompt.

### Stage 7 — Launch hygiene
Legal pages, GDPR data-request endpoint (delete by email), backups (pg_dump nightly to object storage), rate limiting on `/v1/calc` and geocode, Stripe live keys checklist, Swiss Ephemeris Professional licence.

### Later
forecast / synastry / child / bundle products (schema already supports them); pl, de, ru message files (mockup dictionaries can seed them); Apple/Google Pay come free with Checkout.

## 4. Decisions I intend to make unless you object

1. **Python engine is the only calculator.** The web preview calls the internal API instead of re-implementing astronomy in TS. One source of truth; the SVG wheel is also produced server-side.
2. **uv workspace** for Python instead of Poetry/pip-tools; **sqlalchemy-core + Alembic** for schema; no ORM sessions.
3. **Moshier ephemeris first** (bundled in pyswisseph, no downloads); precision is well within the ±1′ acceptance bar. Data files stay a config switch.
4. **Deterministic free preview** (templated paragraphs from a small lexicon), no LLM call before payment — protects cost and removes a fraud vector.
5. **Object storage = S3-compatible** (interface-agnostic client; R2/S3/MinIO), PDFs never on the web host's disk.
6. **Email provider abstraction** with Resend as the first driver (simple API, EU region, attachments) — swap-able.
7. **Locale routing** `natalka.app/uk/...`, `/en/...`; `x-default` → geo.

## 5. Open questions for you

1. **Old pipeline files** — please add `astro_build_pdf.py`, `astro_main_template.py`, `content_*.py`, `METHODOLOGY.md`, `STYLE_GUIDE.md` to the repo (e.g. `reference/astrolog/`). Until then Stage 3 uses `design/pdf.html` as the style source, and the Kharkiv transit test asserts only the three dates you listed.
2. **Legal entity for Stripe.** Stripe does not onboard Ukrainian entities. Which entity will hold the Stripe account (EU company, Stripe Atlas US LLC, other)? This decides tax registrations for Stripe Tax and the footer legal block (the mockup still shows a Ukrainian ФОП).
3. **Prices in EUR** per product for the Stripe price objects (mockups use 19 / 14 / 16 / 14 / 29 € as placeholders). Confirm or give real numbers; also whether the bundle is one Stripe price or a Checkout with two line items.
4. **50 Astro-Seek reference charts** — do you have them as a file? If not, I will generate the input list (varied years 1950–2020, latitudes incl. > 60°, DST edges) and you export Astro-Seek results, or I fetch them via their public pages if you're fine with that.
5. **LLM provider & budget** — Claude via the Anthropic API is my default; do you have an account/key to use, and a per-document cost ceiling?
6. **Hosting** — Vercel for `apps/web` + a VPS/Fly.io/Hetzner Docker host for Postgres + worker + API? The Cloudflare account is not provisioned for this project (if we host on Workers/R2 it needs to be).
7. **Email sender domain** — `natalka.app` and DNS access (SPF/DKIM) — confirm the domain.
8. **Data schema sign-off** — section 2 above (fields, retention, key rotation) before I write migration 0001.
9. **GeoNames scope** — `cities500` (~200k places, ~40 MB) vs `cities15000` (~25k). I propose `cities500` + Ukrainian/Russian alternate names so villages resolve.

## 6. Definition of done for the first coding session
- `pnpm install && uv sync` works from a clean clone; `docker compose up db` starts Postgres; CI green.
- `pytest packages/engine` passes the Yevpatoria and Kharkiv tests.
- `python -m natalka_document.render examples/natal-uk.json out.pdf` produces a PDF with cover, wheel, positions table, aspect grid, TOC and one text section.
