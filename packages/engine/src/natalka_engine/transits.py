"""Transit events computed by root-finding on ephemeris longitudes.

Two kinds of events:

* :class:`Ingress` — a transiting body enters a sign (also when moving retrograde back into it).
* :class:`TransitHit` — a transiting body makes an exact aspect to a natal point. Retrograde loops
  give several passes; ``pass_no`` numbers them per (transit body, natal point, aspect).

Nothing here is estimated: every timestamp is a bisection root of the exact ephemeris to the minute.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta

from . import ephemeris
from .aspects import MAJOR, AspectType
from .bodies import OUTER_PLANETS, Body, Sign, delta, norm360
from .chart import NatalChart

MINUTE = 1.0 / 1440.0
DEFAULT_TARGETS: tuple[Body, ...] = (
    Body.SUN,
    Body.MOON,
    Body.MERCURY,
    Body.VENUS,
    Body.MARS,
    Body.JUPITER,
    Body.SATURN,
    Body.URANUS,
    Body.NEPTUNE,
    Body.PLUTO,
    Body.ASC,
    Body.MC,
)
DEFAULT_KINDS: tuple[AspectType, ...] = (
    AspectType.CONJUNCTION,
    AspectType.OPPOSITION,
    AspectType.SQUARE,
    AspectType.TRINE,
)
# Sampling step in days; must be shorter than the fastest sign-to-sign or aspect-to-aspect gap.
STEP_DAYS: dict[Body, float] = {
    Body.SUN: 1,
    Body.MOON: 0.25,
    Body.MERCURY: 1,
    Body.VENUS: 1,
    Body.MARS: 1,
    Body.JUPITER: 1,
    Body.SATURN: 2,
    Body.URANUS: 3,
    Body.NEPTUNE: 3,
    Body.PLUTO: 3,
    Body.CHIRON: 2,
    Body.NORTH_NODE: 2,
}


@dataclass(frozen=True, slots=True)
class Ingress:
    body: Body
    sign: Sign  # sign entered
    from_sign: Sign
    when: datetime
    retrograde: bool  # entered while moving backwards (i.e. re-entering the previous sign)

    @property
    def kind(self) -> str:
        return "ingress"


@dataclass(frozen=True, slots=True)
class TransitHit:
    body: Body  # transiting
    target: Body  # natal point
    aspect: AspectType
    when: datetime
    retrograde: bool
    pass_no: int  # 1-based within the requested window
    passes: int  # total passes of this contact within the window

    @property
    def kind(self) -> str:
        return "aspect"


TransitEvent = Ingress | TransitHit


def _lon(body: Body, jd: float) -> float:
    return ephemeris.body_position(body, jd).longitude


def _speed(body: Body, jd: float) -> float:
    return ephemeris.body_position(body, jd).speed


def _samples(start_jd: float, end_jd: float, step: float) -> Iterator[float]:
    jd = start_jd
    while jd < end_jd:
        yield jd
        jd += step
    yield end_jd


def _bisect(f: Callable[[float], float], lo: float, hi: float, tol: float = MINUTE) -> float:
    """Root of a continuous ``f`` with a sign change on [lo, hi]."""
    flo = f(lo)
    while hi - lo > tol:
        mid = (lo + hi) / 2
        fmid = f(mid)
        if (fmid < 0) == (flo < 0):
            lo, flo = mid, fmid
        else:
            hi = mid
    return (lo + hi) / 2


def sign_ingresses(body: Body, start: datetime, end: datetime) -> list[Ingress]:
    """Every sign boundary crossing of ``body`` between ``start`` and ``end``."""
    step = STEP_DAYS.get(body, 1)
    s, e = ephemeris.julian_day(start), ephemeris.julian_day(end)
    out: list[Ingress] = []
    prev_jd = s
    prev_sign = Sign.of(_lon(body, s))
    for jd in _samples(s + step, e, step):
        sign = Sign.of(_lon(body, jd))
        if sign != prev_sign:
            boundary = sign * 30.0 if (sign - prev_sign) % 12 == 1 else prev_sign * 30.0

            def crossing(t: float, b: float = boundary) -> float:
                return delta(b, _lon(body, t))

            root = _bisect(crossing, prev_jd, jd)
            retro = _speed(body, root) < 0
            out.append(
                Ingress(
                    body=body,
                    sign=sign,
                    from_sign=prev_sign,
                    when=ephemeris.datetime_from_jd(root),
                    retrograde=retro,
                )
            )
        prev_jd, prev_sign = jd, sign
    return out


def exact_hits(  # noqa: PLR0917 — positional signature mirrors the natural reading order
    body: Body,
    target: Body,
    target_lon: float,
    aspect: AspectType,
    start: datetime,
    end: datetime,
) -> list[TransitHit]:
    """Exact contacts of transiting ``body`` to a fixed natal longitude for one aspect."""
    step = STEP_DAYS.get(body, 1)
    s, e = ephemeris.julian_day(start), ephemeris.julian_day(end)
    angles = {aspect.angle, -aspect.angle} if aspect.angle not in (0, 180) else {aspect.angle}
    roots: list[float] = []
    for angle in angles:
        goal = norm360(target_lon + angle)

        def g(t: float, goal: float = goal) -> float:
            return delta(goal, _lon(body, t))

        prev_jd, prev_val = s, g(s)
        for jd in _samples(s + step, e, step):
            val = g(jd)
            crosses = (val < 0) != (prev_val < 0) and abs(val - prev_val) < 180
            if crosses:
                roots.append(_bisect(g, prev_jd, jd))
            prev_jd, prev_val = jd, val
    roots.sort()
    hits = [
        TransitHit(
            body=body,
            target=target,
            aspect=aspect,
            when=ephemeris.datetime_from_jd(r),
            retrograde=_speed(body, r) < 0,
            pass_no=i + 1,
            passes=len(roots),
        )
        for i, r in enumerate(roots)
    ]
    return hits


def transit_events(
    chart: NatalChart,
    start: datetime,
    end: datetime,
    *,
    bodies: Iterable[Body] = OUTER_PLANETS,
    targets: Iterable[Body] = DEFAULT_TARGETS,
    aspects: Iterable[AspectType] = DEFAULT_KINDS,
    ingresses: bool = True,
) -> list[TransitEvent]:
    """All ingresses and exact hits for a chart in a window, chronological."""
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("start/end must be timezone-aware")
    kinds = tuple(aspects)
    for k in kinds:
        if k not in MAJOR:
            raise ValueError(f"transit aspects are limited to majors, got {k}")
    events: list[TransitEvent] = []
    natal = chart.longitudes
    for body in bodies:
        if ingresses:
            events.extend(sign_ingresses(body, start, end))
        for target in targets:
            if target not in natal:
                continue
            for kind in kinds:
                events.extend(exact_hits(body, target, natal[target], kind, start, end))
    events.sort(key=lambda ev: ev.when)
    return events


def positions_at(when: datetime, bodies: Iterable[Body] = OUTER_PLANETS) -> dict[Body, float]:
    """Transiting longitudes at a moment (for "where the outer planets are now")."""
    jd = ephemeris.julian_day(when)
    return {b: _lon(b, jd) for b in bodies}


def window(start: datetime, years: float) -> tuple[datetime, datetime]:
    return start, start + timedelta(days=365.25 * years)
