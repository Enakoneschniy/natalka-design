"""Generate one full reading against the deployed API and report what it cost.

This is the harness behind the cost figures: it drives the same per-section endpoint the jobs
worker will use, so the numbers it prints are the numbers a real order produces. It writes the
finished PDF next to the JSON so the text can be read, not just counted.

The API answers only with its key, read from NATALKA_API_KEY; the chart comes from the public
ephemeris service, which takes no key and is never sent ours.

    NATALKA_API_KEY=… uv run python scripts/measure_reading.py --lang ru --name Оксана --gender f
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from natalka_document.build import fill_sections, skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Person

RETRYABLE = {429, 500, 502, 503, 504}


def post_with_retry(client: httpx.Client, url: str, payload: dict[str, Any]) -> dict[str, Any]:
    """The container restarts and the provider rate-limits; neither should end a 25-minute run."""
    last = ""
    for attempt in range(4):
        response = client.post(url, json=payload)
        if response.status_code not in RETRYABLE:
            response.raise_for_status()
            return dict(response.json())
        last = f"{response.status_code}: {response.text[:120]}"
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"gave up after four attempts — {last}")


API = "https://natalka-api.ceo-63e.workers.dev"
EPHEMERIS = "https://ephemeris-api.ceo-63e.workers.dev"
KEY_VARIABLE = "NATALKA_API_KEY"
TIMEOUT = httpx.Timeout(600.0)


def api_key() -> str | None:
    """The API's key, from the environment only: never an argument, so it stays out of history."""
    key = os.environ.get(KEY_VARIABLE, "").strip()
    if not key:
        print(f"{KEY_VARIABLE} is not set; the API answers nothing without it.", file=sys.stderr)
        return None
    return key


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=API)
    ap.add_argument("--ephemeris", default=EPHEMERIS)
    ap.add_argument("--date", default="1994-05-15")
    ap.add_argument("--time", dest="birth_time", default="15:25")
    ap.add_argument("--lat", type=float, default=45.1972)
    ap.add_argument("--lon", type=float, default=33.3664)
    ap.add_argument("--place", default="Євпаторія")
    ap.add_argument("--name", default="Оксана")
    ap.add_argument("--gender", default="f", choices=["f", "m", "n"])
    ap.add_argument("--lang", default="uk")
    ap.add_argument("--product", default="natal")
    ap.add_argument("--out", type=Path, default=Path("/tmp/reading"))
    ns = ap.parse_args(argv)

    key = api_key()
    if key is None:
        return 2
    # Two clients: the key goes only to our API, never to the ephemeris service.
    client = httpx.Client(base_url=ns.api, timeout=TIMEOUT, headers={"x-api-key": key})
    ephemeris = httpx.Client(base_url=ns.ephemeris, timeout=TIMEOUT)

    facts = post_with_retry(
        ephemeris,
        "/v1/calc",
        {
            "date": ns.date,
            "time": ns.birth_time,
            "latitude": ns.lat,
            "longitude": ns.lon,
            "transit_years": 3,
        },
    )
    transits = facts.pop("transits", [])
    unknown_time = facts["birth"]["unknown_time"]

    plan = (
        client.get(
            "/v1/sections",
            params={"product": ns.product, "lang": ns.lang, "unknown_time": unknown_time},
        )
        .raise_for_status()
        .json()["sections"]
    )

    print(f"{len(plan)} sections, {len(transits)} transit events\n")

    written: list[str] = []
    results: list[dict[str, Any]] = []
    started = time.monotonic()
    for i, entry in enumerate(plan, 1):
        t0 = time.monotonic()
        section = post_with_retry(
            client,
            "/v1/section",
            {
                "facts": facts,
                "transits": transits,
                "section_id": entry["id"],
                "product": ns.product,
                "lang": ns.lang,
                "name": ns.name,
                "gender": ns.gender,
                "written_so_far": written,
            },
        )
        took = time.monotonic() - t0
        results.append(section)
        written.append(f"{section['title']}: {section['text'][:160]}…")
        flag = " REJECTED" if section["problems"] else ""
        print(
            f"{i:>2}/{len(plan)} {entry['id']:<28} {took:>5.1f}s "
            f"{section['tokens_in']:>6}→{section['tokens_out']:<5} "
            f"${section['cost_micros'] / 1e6:.4f} x{section['attempts']}{flag}"
        )
        if section["problems"]:
            for problem in section["problems"]:
                print(f"      · {problem}")

    total_cost = sum(s["cost_micros"] for s in results) / 1e6
    total_in = sum(s["tokens_in"] for s in results)
    total_out = sum(s["tokens_out"] for s in results)
    retries = sum(1 for s in results if s["attempts"] > 1)
    elapsed = time.monotonic() - started

    document = skeleton(
        facts,
        product=ns.product,
        person=Person(name=ns.name, gender=ns.gender),
        place=ns.place,
        lang=ns.lang,
        transits=transits,
    )
    filled = fill_sections(
        document, {s["id"]: (s["title"], s["text"], s["quote"]) for s in results}
    )
    ns.out.parent.mkdir(parents=True, exist_ok=True)
    json_path = ns.out.with_suffix(".json")
    pdf_path = ns.out.with_suffix(".pdf")
    json_path.write_text(filled.model_dump_json(indent=2), encoding="utf-8")
    pages = render_pdf(filled, pdf_path)

    print(
        f"\ntotal: ${total_cost:.4f} · {total_in} in / {total_out} out tokens · "
        f"{elapsed / 60:.1f} min · {retries} retried · {pages} pages"
    )
    print(f"{pdf_path} · {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
