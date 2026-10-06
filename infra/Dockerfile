# Image for the Python text-and-document API. Runs on Cloudflare Containers (linux/amd64).
# The calculations live in the public ephemeris service; this image writes texts and draws PDFs.
#
# Two stages: the builder resolves /app/.venv, the runtime only copies it — the path is identical in
# both stages, so the venv's absolute shebangs and editable installs stay valid.
#
# Base images are pinned by digest, so a rebuild starts from the same bytes; the tag stays in front
# of each digest for readers and for Dependabot, which moves both together. Resolved 2026-10-06:
#   python:3.12-slim-bookworm            sha256:7753c33391fc…
#   ghcr.io/astral-sh/uv:0.12 (0.12.23)  sha256:61d393e44e24…
FROM python:3.12-slim-bookworm@sha256:7753c33391fc9f01d1984375bf375eb6686d52ba10db6043a86634a5ccf90dcf AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1

COPY --from=ghcr.io/astral-sh/uv:0.12@sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21 /uv /uvx /usr/local/bin/

WORKDIR /app

# Dependency layer: manifests only, so source edits keep the cached install.
COPY pyproject.toml uv.lock ./
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


FROM python:3.12-slim-bookworm@sha256:7753c33391fc9f01d1984375bf375eb6686d52ba10db6043a86634a5ccf90dcf

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

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health').read()"

CMD ["python", "-m", "natalka_worker", "api", "--port", "8000"]
