"""Write one week and one month against the deployed API and report what they cost.

The subscription only pays off if a text costs cents, so the figure matters more here than
anywhere else: it is multiplied by every subscriber and every week they stay.

    uv run python scripts/measure_horoscope.py --lang ru --gender f
"""

from __future__ import annotations

import argparse
import time
from typing import Any

import httpx

API = "https://natalka-api.ceo-63e.workers.dev"
TIMEOUT = httpx.Timeout(300.0)
RETRYABLE = {429, 500, 502, 503, 504}


def post(client: httpx.Client, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    last = ""
    for attempt in range(4):
        response = client.post(f"{API}{path}", json=payload)
        if response.status_code not in RETRYABLE:
            response.raise_for_status()
            return dict(response.json())
        last = f"{response.status_code}: {response.text[:120]}"
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"gave up after four attempts — {last}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="1990-05-17")
    parser.add_argument("--time", dest="birth_time", default="14:30")
    parser.add_argument("--lat", type=float, default=50.4501)
    parser.add_argument("--lon", type=float, default=30.5234)
    parser.add_argument("--zone", default="Europe/Kyiv")
    parser.add_argument("--lang", default="ru")
    parser.add_argument("--gender", default="f")
    parser.add_argument("--name", default="")
    args = parser.parse_args()

    with httpx.Client(timeout=TIMEOUT) as client:
        facts = post(
            client,
            "/v1/calc",
            {
                "date": args.date,
                "time": args.birth_time,
                "latitude": args.lat,
                "longitude": args.lon,
                "zone": args.zone,
            },
        )
        # The subscription would keep only this much of a chart; measure with exactly that.
        stored = {"positions": facts["positions"], "houses": facts["houses"]}

        for period in ("week", "month"):
            started = time.monotonic()
            out = post(
                client,
                "/v1/horoscope",
                {
                    "facts": stored,
                    "period": period,
                    "lang": args.lang,
                    "gender": args.gender,
                    "name": args.name,
                },
            )
            seconds = time.monotonic() - started
            words = len(out["text"].split())
            print(f"\n{'=' * 78}\n{period.upper()}  {out['start']} — {out['end']}\n{'=' * 78}")
            print(out["text"])
            print(
                f"\n{out['events']} exact events · {words} words · {seconds:.1f}s · "
                f"{out['tokens_in']} in / {out['tokens_out']} out · "
                f"${out['cost_micros'] / 1e6:.4f} · {out['model']}"
            )
            if out["problems"]:
                print(f"editor: {'; '.join(out['problems'])}")


if __name__ == "__main__":
    main()
