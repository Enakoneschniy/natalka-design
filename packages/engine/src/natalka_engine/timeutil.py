"""Local birth time → UTC, honouring historical time-zone rules.

Rules come from the system ``tzdata`` (via :mod:`zoneinfo`), which knows e.g. that Crimea switched to
Moscow time on 1994-05-01 or that Ukraine used USSR summer time in the 1980s. Ambiguous local times
(the repeated hour when clocks go back) and non-existent ones (the skipped hour) are resolved
explicitly instead of silently.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

NOON = time(12, 0)


class UnknownTimeZoneError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class LocalMoment:
    utc: datetime
    utc_offset: timedelta
    zone: str
    ambiguous: bool  # clocks went back: two possible instants, we took the first (DST) one
    nonexistent: bool  # clocks went forward: local time never existed, shifted forward by the gap


def to_utc(day: date, local_time: time | None, zone: str) -> LocalMoment:
    """Convert a civil date/time in ``zone`` to UTC.

    ``local_time=None`` means the birth time is unknown: noon local time is used (the conventional
    choice that minimises the maximum Moon error to ~6°).
    """
    try:
        tz = ZoneInfo(zone)
    except ZoneInfoNotFoundError as exc:
        raise UnknownTimeZoneError(zone) from exc
    t = local_time or NOON
    fold0 = datetime.combine(day, t, tzinfo=tz)
    fold1 = fold0.replace(fold=1)
    utc0, utc1 = fold0.astimezone(UTC), fold1.astimezone(UTC)
    ambiguous = utc0 != utc1 and fold0.utcoffset() != fold1.utcoffset() and _exists(fold0)
    nonexistent = not _exists(fold0)
    chosen = fold0
    if nonexistent:
        # Shift forward by the gap so 02:30 during a 02:00→03:00 change becomes 03:30 (same instant
        # the clock would have shown after the jump).
        gap = (fold1.utcoffset() or timedelta()) - (fold0.utcoffset() or timedelta())
        chosen = (fold0 + abs(gap)).replace(fold=0)
    utc = chosen.astimezone(UTC)
    return LocalMoment(
        utc=utc,
        utc_offset=chosen.utcoffset() or timedelta(),
        zone=zone,
        ambiguous=bool(ambiguous),
        nonexistent=nonexistent,
    )


def _exists(local: datetime) -> bool:
    """A local time exists if converting to UTC and back yields the same wall time."""
    return local.astimezone(UTC).astimezone(local.tzinfo).replace(fold=0) == local.replace(fold=0)


def format_offset(offset: timedelta) -> str:
    total = int(offset.total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    h, rem = divmod(total, 3600)
    m = rem // 60
    return f"UTC{sign}{h}" if m == 0 else f"UTC{sign}{h}:{m:02d}"
