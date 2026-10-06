# Natalka

Automated natal-chart readings: the client enters birth data, sees a free preview, and receives a
25–40 page PDF by email. International and multilingual.

See [PLAN.md](PLAN.md) for the roadmap, the data model and the open questions.

## Layout

```
apps/web/          Next.js front end (not started yet)
apps/worker/       internal FastAPI API + job worker (Python)
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
curl -s -X POST https://ephemeris-api.ceo-63e.workers.dev/v1/calc \
  -H "content-type: application/json" \
  -d '{"date":"1994-05-15","time":"15:25","latitude":45.1972,"longitude":33.3664}'
# the example reading as PDF
uv run natalka-document render packages/document/examples/natal-uk.json out.pdf
# the internal API on 127.0.0.1:8000 (docs disabled; see apps/worker/src/natalka_worker/api.py)
uv run python -m natalka_worker api --host 127.0.0.1
```

## Security

This repository is public. To report a vulnerability, write to help@chronika.me — not a public
issue. What is in scope and how we handle reports: [SECURITY.md](SECURITY.md). The settings, secrets
and release order that live outside the code: [docs/operations.md](docs/operations.md).

## Licence note

**No AGPL dependency is allowed in this repository.** The calculation engine, which links
`pyswisseph` (AGPL-3.0), lives in its own public repository and is called over HTTP:
[ephemeris-service](https://github.com/Enakoneschniy/ephemeris-service). See
[docs/ephemeris-service-brief.md](docs/ephemeris-service-brief.md).
