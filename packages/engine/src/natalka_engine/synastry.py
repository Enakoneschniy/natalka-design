"""Two charts read against each other.

Synastry asks two questions the natal chart cannot: which of your planets touch mine, and where do
mine land in your houses. Both are computed here from two finished charts — nothing new is asked of
the ephemeris, so a pair of readings costs exactly one extra set of angles.
"""

from __future__ import annotations

from dataclasses import dataclass

from .aspects import MAJOR, MINOR, Aspect, AspectType, orb_for
from .bodies import ASPECTABLE, Body, delta
from .chart import NatalChart, house_of

#: Which bodies take part. The angles are included: a partner's Sun on your Ascendant is the
#: loudest contact in synastry, and leaving it out would be a strange omission.
CROSS_BODIES: tuple[Body, ...] = ASPECTABLE


@dataclass(frozen=True, slots=True)
class CrossAspect:
    """An aspect between a body of the first chart and a body of the second.

    Unlike a natal aspect this is not symmetric in meaning — "his Saturn on her Moon" is a
    different sentence from "her Saturn on his Moon" — so the order of the two charts is part of
    the data rather than something the reader has to infer.
    """

    a: Body  # from the first chart
    b: Body  # from the second chart
    kind: AspectType
    orb: float
    separation: float

    @property
    def strength(self) -> float:
        return max(0.0, 1.0 - self.orb / orb_for(self.a, self.b, self.kind))


def cross_aspects(
    first: NatalChart,
    second: NatalChart,
    *,
    bodies: tuple[Body, ...] = CROSS_BODIES,
    include_minor: bool = True,
) -> list[CrossAspect]:
    """Every aspect from a body of ``first`` to a body of ``second``, closest orb first.

    Both directions of a pair are present — Sun/Moon and Moon/Sun are two different contacts —
    which is why this cannot reuse ``find_aspects``: that one walks a single chart and skips the
    mirror half on purpose.
    """
    kinds = (*MAJOR, *MINOR) if include_minor else MAJOR
    left = {b: p.longitude for b, p in first.positions.items() if b in bodies}
    right = {b: p.longitude for b, p in second.positions.items() if b in bodies}

    found: list[CrossAspect] = []
    for a, lon_a in left.items():
        for b, lon_b in right.items():
            sep = delta(lon_a, lon_b)
            for kind in kinds:
                orb = abs(abs(sep) - kind.angle)
                if orb <= orb_for(a, b, kind):
                    found.append(CrossAspect(a, b, kind, orb, sep))
                    break  # one aspect per pair
    found.sort(key=lambda x: x.orb)
    return found


def house_overlay(guest: NatalChart, host: NatalChart) -> dict[Body, int]:
    """Which of the host's houses each of the guest's bodies falls into.

    This is the half of synastry that says where someone actually shows up in your life — money,
    home, work — and it needs the host's birth time. Without houses it returns nothing rather than
    guessing, the same rule the natal reading follows.
    """
    if host.houses is None:
        return {}
    cusps = host.houses.cusps
    return {
        body: house_of(position.longitude, cusps)
        for body, position in guest.positions.items()
        if body.is_planet or body in (Body.CHIRON, Body.NORTH_NODE, Body.LILITH)
    }


def natal_aspect_of(chart: NatalChart, a: Body, b: Body) -> Aspect | None:
    """The natal aspect between two bodies of one chart, if there is one."""
    for aspect in chart.aspects:
        if {aspect.a, aspect.b} == {a, b}:
            return aspect
    return None
