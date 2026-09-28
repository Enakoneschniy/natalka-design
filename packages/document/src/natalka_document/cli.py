"""`natalka-document`: render a document JSON to PDF, or build the bundled example."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .render import render_pdf
from .schema import Document, json_schema


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="natalka-document")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render", help="document.json → out.pdf")
    r.add_argument("source", type=Path)
    r.add_argument("target", type=Path)
    s = sub.add_parser("schema", help="print the JSON Schema of a document")
    s.add_argument("--out", type=Path)
    ns = ap.parse_args(argv)

    if ns.cmd == "render":
        doc = Document.model_validate_json(ns.source.read_text(encoding="utf-8"))
        pages = render_pdf(doc, ns.target)
        print(f"{ns.target} — {pages} pages")
        return 0
    text = json.dumps(json_schema(), ensure_ascii=False, indent=2)
    if ns.out:
        ns.out.write_text(text + "\n", encoding="utf-8")
    else:
        sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
