"""`python -m natalka_worker api|worker`."""

from __future__ import annotations

import argparse
import sys

import uvicorn


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="natalka-worker")
    ap.add_argument("role", choices=["api", "worker"])
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    ns = ap.parse_args(argv)
    if ns.role == "api":
        uvicorn.run("natalka_worker.api:app", host=ns.host, port=ns.port, workers=1)
        return 0
    sys.stderr.write("worker loop is not implemented yet (Stage 5)\n")
    return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
