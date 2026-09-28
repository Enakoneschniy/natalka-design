"""`natalka-engine` command line: compute a chart or transits as JSON (debugging aid)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, date, datetime, time

from .chart import NatalInput, compute_natal
from .geo import zone_for
from .serialize import chart_to_dict, events_to_list
from .transits import transit_events


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="natalka-engine")
    ap.add_argument("date", help="YYYY-MM-DD")
    ap.add_argument("time", nargs="?", help="HH:MM local, omit if unknown")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--zone", help="IANA zone; derived from coordinates when omitted")
    ap.add_argument(
        "--transits", type=float, metavar="YEARS", help="also list transits for N years from now"
    )
    ns = ap.parse_args(argv)

    zone = ns.zone or zone_for(ns.lat, ns.lon)
    t = time.fromisoformat(ns.time) if ns.time else None
    chart = compute_natal(NatalInput(date.fromisoformat(ns.date), t, zone, ns.lat, ns.lon))
    payload = chart_to_dict(chart)
    if ns.transits:
        start = datetime.now(UTC)
        end = start.replace(year=start.year + int(ns.transits))
        payload["transits"] = events_to_list(transit_events(chart, start, end))
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
