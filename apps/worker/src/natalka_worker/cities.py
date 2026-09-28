"""City search for the birth-place field, backed by the GeoNames extract.

The database is built by `infra/build_cities.py` and baked into the image; it is read-only, so
every thread gets its own connection and nothing ever writes.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path

DB_PATH = Path(os.environ.get("NATALKA_CITIES_DB", "data/cities.sqlite"))

_local = threading.local()


class CityDatabaseMissingError(RuntimeError):
    """The extract has not been built — see infra/build_cities.py."""


@dataclass(frozen=True, slots=True)
class City:
    id: int
    name: str
    country: str
    region: str | None
    latitude: float
    longitude: float
    zone: str
    population: int


def _connection() -> sqlite3.Connection:
    conn: sqlite3.Connection | None = getattr(_local, "conn", None)
    if conn is None:
        if not DB_PATH.exists():
            raise CityDatabaseMissingError(str(DB_PATH))
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
        _local.conn = conn
    return conn


def _match_expression(query: str) -> str:
    """FTS5 query: every word a prefix, so "kyi obl" still finds "Kyiv Oblast"."""
    words = [w.replace('"', "") for w in query.split()]
    return " ".join(f'"{w}"*' for w in words if w)


def search_cities(query: str, limit: int = 8) -> list[City]:
    query = query.strip()
    if len(query) < 2:
        return []
    expression = _match_expression(query)
    if not expression:
        return []
    rows = (
        _connection()
        .execute(
            """
        SELECT c.id, c.name, c.country, c.admin1, c.latitude, c.longitude, c.zone, c.population
        FROM city_fts f JOIN city c ON c.id = f.rowid
        WHERE city_fts MATCH ?
        ORDER BY (lower(c.name) = lower(?)) DESC, c.population DESC
        LIMIT ?
        """,
            (expression, query, limit),
        )
        .fetchall()
    )
    return [City(*row) for row in rows]
