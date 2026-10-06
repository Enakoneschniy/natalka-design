"""Write one week and one month against the deployed API and report what they cost.

The subscription only pays off if a text costs cents, so the figure matters more here than
anywhere else: it is multiplied by every subscriber and every week they stay.

The API answers only with its key, read from NATALKA_API_KEY. The chart, the transits and the sky
come from the public ephemeris service, as they do for the jobs worker; it takes no key and is
never sent ours.

    NATALKA_API_KEY=… uv run python scripts/measure_horoscope.py --lang ru --gender f
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
import time
from typing import Any

import httpx

API = "https://natalka-api.ceo-63e.workers.dev"
EPHEMERIS = "https://ephemeris-api.ceo-63e.workers.dev"
KEY_VARIABLE = "NATALKA_API_KEY"
TIMEOUT = httpx.Timeout(300.0)
RETRYABLE = {429, 500, 502, 503, 504}
#: How far each window reaches, as the subscription counts it.
DAYS = {"week": 7, "month": 30}


def post(client: httpx.Client, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    last = ""
    for attempt in range(4):
        response = client.post(path, json=payload)
        if response.status_code not in RETRYABLE:
            response.raise_for_status()
            return dict(response.json())
        last = f"{response.status_code}: {response.text[:120]}"
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"gave up after four attempts — {last}")


def api_key() -> str | None:
    """The API's key, from the environment only: never an argument, so it stays out of history."""
    key = os.environ.get(KEY_VARIABLE, "").strip()
    if not key:
        print(f"{KEY_VARIABLE} is not set; the API answers nothing without it.", file=sys.stderr)
        return None
    return key


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=API)
    parser.add_argument("--ephemeris", default=EPHEMERIS)
    parser.add_argument("--date", default="1990-05-17")
    parser.add_argument("--time", dest="birth_time", default="14:30")
    parser.add_argument("--lat", type=float, default=50.4501)
    parser.add_argument("--lon", type=float, default=30.5234)
    parser.add_argument("--zone", default="Europe/Kyiv")
    parser.add_argument("--lang", default="ru")
    parser.add_argument("--gender", default="f")
    parser.add_argument("--name", default="")
    args = parser.parse_args(argv)

    key = api_key()
    if key is None:
        return 2
    # Two clients: the key goes only to our API, never to the ephemeris service.
    with (
        httpx.Client(base_url=args.api, timeout=TIMEOUT, headers={"x-api-key": key}) as api,
        httpx.Client(base_url=args.ephemeris, timeout=TIMEOUT) as ephemeris,
    ):
        facts = post(
            ephemeris,
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
        longitudes = {p["body"]: p["longitude"] for p in stored["positions"]}
        cusps = [c["longitude"] for c in stored["houses"]["cusps"]] if stored["houses"] else None
        start = dt.datetime.now(dt.UTC).date()

        for period in ("week", "month"):
            end = start + dt.timedelta(days=DAYS[period])
            window = {"start": start.isoformat(), "end": end.isoformat()}
            transits = post(ephemeris, "/v1/transits", {"longitudes": longitudes, **window})
            sky = post(
                ephemeris, "/v1/sky", {"when": f"{window['start']}T00:00:00Z", "cusps": cusps}
            )
            started = time.monotonic()
            out = post(
                api,
                "/v1/horoscope",
                {
                    "facts": stored,
                    "transits": transits["events"],
                    "sky": sky["positions"],
                    "period": period,
                    **window,
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
