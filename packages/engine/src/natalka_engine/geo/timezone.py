"""Coordinates → IANA zone via timezonefinder (offline, polygon lookup)."""

from __future__ import annotations

from functools import lru_cache

from timezonefinder import TimezoneFinder


@lru_cache(maxsize=1)
def _finder() -> TimezoneFinder:
    return TimezoneFinder(in_memory=True)


def zone_for(latitude: float, longitude: float) -> str:
    """IANA zone name for a point (timezonefinder also covers territorial waters)."""
    zone = _finder().timezone_at(lat=latitude, lng=longitude)
    if zone is None:
        raise LookupError(f"no time zone for {latitude}, {longitude}")
    return str(zone)
