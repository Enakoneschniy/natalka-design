"""Turn the GeoNames extract into D1 import files.

City search sits on the first screen of the funnel, and routing it through the Python container
costs a worker-to-worker hop plus, when the container has gone to sleep, several seconds of cold
start. The data never changes between deploys, so it belongs next to the code that queries it.

    uv run python scripts/cities_to_d1.py data/cities.sqlite /tmp/cities.sql
    for f in /tmp/cities-*.sql; do wrangler d1 execute natalka --remote --file="$f"; done
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path
from typing import IO

#: D1 rejects a single file of this size, so the dump is written in parts.
ROWS_PER_PART = 12_000
#: One statement per batch: D1 charges per round trip, and 70 000 single-row inserts take minutes.
ROWS_PER_STATEMENT = 200


def quote(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int | float):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_parts(rows: list[tuple[object, ...]], target: Path) -> list[Path]:
    parts: list[Path] = []

    def open_part(index: int) -> IO[str]:
        path = target.with_name(f"{target.stem}-{index:02d}{target.suffix}")
        parts.append(path)
        return path.open("w", encoding="utf-8")

    out = open_part(0)
    out.write("DROP TABLE IF EXISTS city_fts;\n")
    out.write("DROP TABLE IF EXISTS city;\n")
    out.write(
        "CREATE TABLE city (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, "
        "admin1 TEXT, latitude REAL NOT NULL, longitude REAL NOT NULL, zone TEXT NOT NULL, "
        "population INTEGER NOT NULL, search TEXT NOT NULL);\n"
    )
    out.write(
        "CREATE VIRTUAL TABLE city_fts USING fts5(search, content='city', content_rowid='id', "
        "prefix='2 3 4', tokenize=\"unicode61 remove_diacritics 2\");\n"
    )

    part = 0
    in_part = 0
    for start in range(0, len(rows), ROWS_PER_STATEMENT):
        if in_part >= ROWS_PER_PART:
            out.close()
            part += 1
            in_part = 0
            out = open_part(part)
        chunk = rows[start : start + ROWS_PER_STATEMENT]
        values = ",".join("(" + ",".join(quote(v) for v in row) + ")" for row in chunk)
        out.write(f"INSERT INTO city VALUES {values};\n")
        # The index is written next to the rows rather than rebuilt at the end: a rebuild across
        # seventy thousand documents is one statement too large for D1 to finish.
        fts = ",".join(f"({row[0]},{quote(row[8])})" for row in chunk)
        out.write(f"INSERT INTO city_fts(rowid, search) VALUES {fts};\n")
        in_part += len(chunk)

    out.write("CREATE INDEX IF NOT EXISTS city_population ON city(population DESC);\n")
    out.close()
    return parts


def main() -> int:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "data/cities.sqlite")
    target = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/cities.sql")

    db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    rows = db.execute(
        "SELECT id, name, country, admin1, latitude, longitude, zone, population, search FROM city"
    ).fetchall()

    parts = write_parts(rows, target)
    total = sum(p.stat().st_size for p in parts) / 1e6
    for path in parts:
        sys.stdout.write(f"{path}\n")
    sys.stdout.write(f"{len(rows)} cities in {len(parts)} parts, {total:.1f} MB\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
