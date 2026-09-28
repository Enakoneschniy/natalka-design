# Single image for both roles: `natalka_worker api` and `natalka_worker worker`.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /usr/local/bin/

WORKDIR /app

# Dependency layer: only manifests, so edits to source do not invalidate the cache.
COPY pyproject.toml uv.lock ./
COPY packages/engine/pyproject.toml packages/engine/
COPY packages/document/pyproject.toml packages/document/
COPY packages/texts/pyproject.toml packages/texts/
COPY packages/shared/pyproject.toml packages/shared/
COPY apps/worker/pyproject.toml apps/worker/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-workspace --no-dev

COPY packages/ packages/
COPY apps/worker/ apps/worker/
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

RUN useradd --uid 10001 --create-home natalka && chown -R natalka:natalka /app
USER natalka

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health').read()"

CMD ["python", "-m", "natalka_worker", "api", "--port", "8000"]
