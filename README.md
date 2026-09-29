# Natalka

Automated natal-chart readings: the client enters birth data, sees a free preview, and receives a
25–40 page PDF by email. International and multilingual.

See [PLAN.md](PLAN.md) for the roadmap, the data model and the open questions.

## Layout

```
apps/web/          Next.js front end (not started yet)
apps/worker/       internal FastAPI API + job worker (Python)
packages/engine/   astrology: positions, houses, aspects, transits, time zones
packages/document/ document schema → ReportLab PDF, SVG chart wheel
packages/texts/    section prompts, LLM client, validators (not started yet)
packages/shared/   settings, AES-GCM encryption, DB access
design/            static design mockups — the UI source of truth
reference/         the legacy "Астролог" pipeline, kept as a quality reference
infra/             docker-compose, Dockerfile
```

## Getting started

```bash
uv sync                                   # Python workspace (needs uv ≥ 0.12, Python 3.12)
pnpm install                              # JS workspace
cp .env.example .env                      # fill in the two generated secrets
docker compose -f infra/docker-compose.yml up db

uv run pytest -q                          # 28 tests
uv run ruff check packages apps && uv run mypy

# a chart as JSON
uv run natalka-engine 1994-05-15 15:25 --lat 45.1972 --lon 33.3664
# the example reading as PDF
uv run natalka-document render packages/document/examples/natal-uk.json out.pdf
# the internal API on :8000 (docs disabled; see apps/worker/src/natalka_worker/api.py)
uv run python -m natalka_worker api
```

## Licence note

`pyswisseph` and the bundled ephemeris files are AGPL-3.0. A **commercial** licence from the publisher must be purchased before the public launch — see
[packages/engine/README.md](packages/engine/README.md). No other AGPL dependency is allowed.
