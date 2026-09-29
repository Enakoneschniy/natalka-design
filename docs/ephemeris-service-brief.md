# Brief: the public ephemeris service

Decision (owner, 2026-09-29): the calculation layer that links `pyswisseph` (AGPL-3.0) is split
out of this repository into a **public, AGPL-3.0 service**, and everything here — texts, prompts,
documents, orders, the site — stays private and talks to it over HTTP. No commercial ephemeris
licence is bought. This is AGPL compliance, not a workaround: it only holds if the public service
is a real, independently usable program whose source is offered to everyone who uses it.

## What this must achieve

1. Nothing in this private repository imports `swisseph`, links to it, or ships its data files.
2. The public service contains *everything* that runs in the same process as `swisseph`, under
   AGPL-3.0, with the original copyright and licence notices intact.
3. Every user of the public service can find its complete corresponding source: a link in a
   response header and on the service's front page.
4. Our own product keeps working exactly as today, with the same numbers (the engine tests are
   the acceptance suite), through a network call instead of an import.

## The public repository

- Name: `ephemeris-service` (owner's GitHub; a neutral name — not the product's brand).
- Licence: `LICENSE` = AGPL-3.0. Keep `packages/engine/src/natalka_engine/ephe/LICENSE.md` and
  every notice from pyswisseph / Swiss Ephemeris. `README` states the licence, credits Swiss
  Ephemeris and Astrodienst AG, and links the source.
- Contents moved from here (history not needed, a clean first commit):
  - `packages/engine` → `engine/` (rename the package `natalka_engine` → `ephemeris_engine`;
    strip the product name everywhere).
  - A thin FastAPI app over it: the calc endpoints only.
  - `infra/Dockerfile` (two-stage, builds pyswisseph), a Cloudflare Container + Worker in front,
    a GitHub Actions workflow that builds and deploys — copied from this repo's `container.yml`.
- Endpoints (JSON in, JSON out; these are the shapes `natalka_engine.serialize` already produces):
  - `POST /v1/calc` — `{date, time|null, latitude, longitude, zone, transit_years?}` →
    `chart_to_dict(...)` (+ `transits` when asked).
  - `POST /v1/synastry` — `{first, second}` → `synastry_to_dict(...)`.
  - `POST /v1/transits` — `{longitudes: {body: deg}, start, end, bodies?, targets?}` →
    `events_to_list(events_for(...))` — what the horoscope needs from a stored chart.
  - `POST /v1/sky` — `{when, bodies?}` → `positions_at(...)` with signs and degrees.
  - `GET /v1/zone?lat&lon` → time zone for a point (uses `timezonefinder`, MIT).
  - `GET /health` → `{status, ephemeris_version, build, source}`.
  - `GET /` → a plain page: what this is, the licence, the repository link, the endpoints.
- Every response carries `X-Source-Repository: https://github.com/<owner>/ephemeris-service`.
- Access: open, rate-limited by IP at the Worker (e.g. 60 requests/minute); our own product
  calls it through a Cloudflare **service binding** (same account), which bypasses the limit.
  Paid keys for third parties are a later feature — not part of this brief.
- Tests: the engine's existing suites (`test_reference_charts`, `test_transits`, `test_units`,
  `test_synastry`) move with it and must pass unchanged.

## What changes in this repository

- Delete `packages/engine` and the `pyswisseph` dependency; `apps/worker` (the private
  container: texts + document) loses every `from natalka_engine import …`:
  - `/v1/calc`, `/v1/synastry`, `/v1/zone` are removed from the private API — the jobs worker
    and the site call the public service directly (service binding `EPHEMERIS`).
  - `/v1/horoscope` takes the transit list and the sky as input instead of computing them
    (the jobs worker gets both from `/v1/transits` and `/v1/sky` first).
  - `/v1/wheel.svg` and the document's wheel need no engine — they draw from the facts JSON;
    check `natalka_document.wheel` imports nothing from the engine (it must not).
  - `natalka_texts.facts` uses only the facts JSON already.
- `apps/api-edge` no longer needs to build pyswisseph; the Dockerfile drops the C toolchain.
- `apps/jobs`: `calculate()` and `createSubscription()` call the public service; the demo chart
  on the landing page (`apps/web/src/lib/demo-chart.json`) is regenerated from it once.
- The product brief's rule changes from "no AGPL except pyswisseph" to "**no AGPL at all** in
  this repository".
- Memory / docs: update `README.md` licence note and `PLAN.md`.

## Acceptance

- `grep -r swisseph` in this repository finds nothing but this document.
- A natal chart, a synastry and a weekly horoscope generated end to end on production match the
  numbers from before the split (compare against a stored `/v1/calc` response for the demo data).
- The public service answers from a cold start within the same budget the private one had, and
  `/` shows the licence and the repository link.

## Order of work

1. Create the public repository from `packages/engine` + the thin API; deploy; run its tests.
2. Point `apps/jobs` and `apps/web` at it behind a flag; verify numbers match.
3. Remove the engine from this repository; rebuild the private container; deploy.
4. Update docs and the brief's licensing rule.
