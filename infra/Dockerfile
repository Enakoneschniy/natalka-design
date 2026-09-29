# Image for the Python calculation API. Runs on Cloudflare Containers (linux/amd64) and locally
# through infra/docker-compose.yml. Two roles: `natalka_worker api` and `natalka_worker worker`.
#
# Two stages because pyswisseph ships no wheels: it needs a C toolchain to build, which we do not
# want in the image we deploy. The builder compiles /app/.venv, the runtime only copies it — the
# path is identical in both stages, so the venv's absolute shebangs and editable installs stay valid.
FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /usr/local/bin/

RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependency layer: manifests only, so source edits keep the cached install.
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
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev \
    && find /app/.venv -name '__pycache__' -type d -prune -exec rm -rf {} + \
    && find /app/.venv -name '*.pyc' -delete


FROM python:3.12-slim-bookworm

# Which commit this image was built from. Without it there is no way to tell from the outside
# whether a deploy has actually reached the running container.
ARG NATALKA_BUILD=dev
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NATALKA_BUILD=${NATALKA_BUILD} \
    PATH="/app/.venv/bin:$PATH"

RUN useradd --uid 10001 --create-home natalka
WORKDIR /app

COPY --from=builder --chown=natalka:natalka /app/.venv /app/.venv
# The workspace packages are installed editable, so their sources have to be here as well.
COPY --chown=natalka:natalka packages/ packages/
COPY --chown=natalka:natalka apps/worker/ apps/worker/

USER natalka

# Warm the ephemeris and the time-zone index at build time so the first request is not the slowest.
RUN python -c "from natalka_engine import ephemeris; ephemeris.configure(); from natalka_engine.geo import zone_for; zone_for(50.45, 30.52)"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health').read()"

CMD ["python", "-m", "natalka_worker", "api", "--port", "8000"]
