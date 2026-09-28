"""The single boundary to pyswisseph.

Nothing else in the engine may ``import swisseph``. This keeps the AGPL dependency in one file and
makes every other module unit-testable with a fake backend.

Ephemeris data: the bundled ``ephe/`` directory (sepl/semo/seas 1800–2399) is used by default; set
``NATALKA_EPHEMERIS_PATH`` / :func:`configure` to point at a full Astrodienst set. Outside the
bundled range swisseph falls back to the built-in Moshier ephemeris for planets (Chiron becomes
unavailable there, which :func:`body_position` reports by raising :class:`BodyUnavailableError`).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import swisseph as swe

from .bodies import Body

_BUNDLED = Path(__file__).with_name("ephe")
_FLAGS = swe.FLG_SWIEPH | swe.FLG_SPEED
_LOCK = threading.Lock()  # pyswisseph keeps global state; serialise calls
_configured = False

_SWE_ID: dict[Body, int] = {
    Body.SUN: swe.SUN,
    Body.MOON: swe.MOON,
    Body.MERCURY: swe.MERCURY,
    Body.VENUS: swe.VENUS,
    Body.MARS: swe.MARS,
    Body.JUPITER: swe.JUPITER,
    Body.SATURN: swe.SATURN,
    Body.URANUS: swe.URANUS,
    Body.NEPTUNE: swe.NEPTUNE,
    Body.PLUTO: swe.PLUTO,
    Body.CHIRON: swe.CHIRON,
    Body.NORTH_NODE: swe.TRUE_NODE,
    Body.LILITH: swe.MEAN_APOG,
}

HOUSE_SYSTEMS = {
    "placidus": b"P",
    "porphyry": b"O",
    "whole_sign": b"W",
    "equal": b"A",
    "koch": b"K",
}


class BodyUnavailableError(RuntimeError):
    """The ephemeris cannot compute this body for the requested date."""


@dataclass(frozen=True, slots=True)
class BodyPosition:
    longitude: float  # ecliptic, tropical, degrees [0, 360)
    latitude: float
    distance_au: float
    speed: float  # degrees/day in longitude; negative = retrograde


@dataclass(frozen=True, slots=True)
class HouseData:
    cusps: tuple[float, ...]  # 12 cusps, index 0 = house 1
    asc: float
    mc: float
    armc: float
    vertex: float
    system: str


def configure(path: str | Path | None = None) -> None:
    """Point swisseph at an ephemeris directory (default: bundled files)."""
    global _configured  # noqa: PLW0603 — module-level backend state by design
    with _LOCK:
        swe.set_ephe_path(str(path or _BUNDLED))
        _configured = True


def _ensure() -> None:
    if not _configured:
        configure()


def julian_day(dt: datetime) -> float:
    """UTC datetime → Julian Day (UT). Naive datetimes are rejected on purpose."""
    if dt.tzinfo is None:
        raise ValueError("datetime must be timezone-aware")
    u = dt.astimezone(UTC)
    hour = u.hour + u.minute / 60 + u.second / 3600 + u.microsecond / 3_600_000_000
    return float(swe.julday(u.year, u.month, u.day, hour, swe.GREG_CAL))


def datetime_from_jd(jd: float) -> datetime:
    """Julian Day (UT) → aware UTC datetime, microsecond precision."""
    y, m, d, h = swe.revjul(jd, swe.GREG_CAL)
    return datetime(y, m, d, tzinfo=UTC) + timedelta(hours=h)


def body_position(body: Body, jd: float) -> BodyPosition:
    """Geocentric tropical position of a planet/point at Julian Day ``jd``."""
    _ensure()
    try:
        swe_id = _SWE_ID[body]
    except KeyError as exc:
        raise ValueError(f"{body} is not an ephemeris body") from exc
    with _LOCK:
        try:
            values, _ = swe.calc_ut(jd, swe_id, _FLAGS)
        except swe.Error as exc:  # e.g. Chiron outside the data-file range
            raise BodyUnavailableError(f"{body}: {exc}") from exc
    return BodyPosition(
        longitude=values[0] % 360.0, latitude=values[1], distance_au=values[2], speed=values[3]
    )


def houses(jd: float, latitude: float, longitude: float, system: str = "placidus") -> HouseData:
    """House cusps and angles. ``system`` is one of :data:`HOUSE_SYSTEMS`."""
    _ensure()
    code = HOUSE_SYSTEMS[system]
    with _LOCK:
        cusps, ascmc = swe.houses_ex(jd, latitude, longitude, code, _FLAGS)
    return HouseData(
        cusps=tuple(c % 360.0 for c in cusps[:12]),
        asc=ascmc[0] % 360.0,
        mc=ascmc[1] % 360.0,
        armc=ascmc[2],
        vertex=ascmc[3] % 360.0,
        system=system,
    )


def obliquity(jd: float) -> float:
    """True obliquity of the ecliptic, degrees (used for the Sun's declination, day/night charts)."""
    _ensure()
    with _LOCK:
        values, _ = swe.calc_ut(jd, swe.ECL_NUT, 0)
    return float(values[0])


def version() -> str:
    return str(swe.version)
