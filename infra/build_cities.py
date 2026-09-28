#!/usr/bin/env python3
"""Build the city-search database from the GeoNames dump.

GeoNames data is CC BY 4.0 (https://www.geonames.org) — the attribution lives in the web footer.
We take `cities5000` (every place above 5 000 inhabitants), which covers birth places well enough
while keeping the file small; the per-row `alternatenames` column is what makes searching in
Cyrillic or any other script work without the 200 MB alternateNamesV2 dump.

Usage: python infra/build_cities.py [output.sqlite]
"""

from __future__ import annotations

import io
import sqlite3
import sys
import urllib.request
import zipfile
from pathlib import Path

DUMP = "https://download.geonames.org/export/dump/cities5000.zip"
MEMBER = "cities5000.txt"
ADMIN1 = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"

# Alternate names are stored for matching only, so we keep the scripts our locales are written in
# plus the Latin original; anything else (Chinese, Arabic, Japanese …) only bloats the index.
KEEP_SCRIPTS = (
    range(0x0020, 0x024F),  # Latin incl. supplements
    range(0x0370, 0x04FF),  # Greek and Cyrillic
)


def _searchable(value: str) -> bool:
    return all(any(ord(ch) in r for r in KEEP_SCRIPTS) for ch in value)


def build(out: Path) -> None:
    with urllib.request.urlopen(DUMP) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    rows = archive.read(MEMBER).decode("utf-8").splitlines()
    with urllib.request.urlopen(ADMIN1) as response:
        regions = {
            line.split("\t")[0]: line.split("\t")[1]
            for line in response.read().decode("utf-8").splitlines()
            if line
        }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.unlink(missing_ok=True)
    db = sqlite3.connect(out)
    db.executescript("""
        CREATE TABLE city (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            admin1 TEXT,  -- resolved region name, e.g. "Kharkivska oblast"
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            zone TEXT NOT NULL,
            population INTEGER NOT NULL
        );
        CREATE VIRTUAL TABLE city_fts USING fts5(
            names,
            content='',
            prefix='2 3 4',
            tokenize="unicode61 remove_diacritics 2"
        );
    """)

    for line in rows:
        f = line.split("\t")
        if len(f) < 18:
            continue
        geoname_id = int(f[0])
        names = {f[1], f[2], *(n for n in f[3].split(",") if n)}
        names = {n for n in names if n and _searchable(n)}
        db.execute(
            "INSERT INTO city VALUES (?,?,?,?,?,?,?,?)",
            (
                geoname_id,
                f[1],
                f[8],
                regions.get(f"{f[8]}.{f[10]}"),
                float(f[4]),
                float(f[5]),
                f[17],
                int(f[14] or 0),
            ),
        )
        db.execute("INSERT INTO city_fts(rowid, names) VALUES (?,?)", (geoname_id, " ".join(names)))

    db.execute("CREATE INDEX city_population ON city(population DESC)")
    db.commit()
    db.execute("VACUUM")
    db.execute("PRAGMA optimize")
    db.close()


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "data/cities.sqlite")
    build(target)
    sys.stdout.write(f"{target} — {target.stat().st_size / 1e6:.1f} MB\n")
