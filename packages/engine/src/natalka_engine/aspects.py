"""Aspects between chart points with per-body orbs."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .bodies import ASPECTABLE, Body, delta


class AspectType(StrEnum):
    CONJUNCTION = "conjunction"
    OPPOSITION = "opposition"
    TRINE = "trine"
    SQUARE = "square"
    SEXTILE = "sextile"
    QUINCUNX = "quincunx"
    SEMISEXTILE = "semisextile"
    SEMISQUARE = "semisquare"
    SESQUIQUADRATE = "sesquiquadrate"

    @property
    def angle(self) -> float:
        return _ANGLE[self]

    @property
    def is_major(self) -> bool:
        return self in MAJOR

    @property
    def nature(self) -> str:
        """``harmonious`` / ``tense`` / ``neutral`` — the colour used in the wheel and the text."""
        if self in (AspectType.TRINE, AspectType.SEXTILE, AspectType.SEMISEXTILE):
            return "harmonious"
        if self in (AspectType.CONJUNCTION,):
            return "neutral"
        return "tense"


_ANGLE: dict[AspectType, float] = {
    AspectType.CONJUNCTION: 0,
    AspectType.OPPOSITION: 180,
    AspectType.TRINE: 120,
    AspectType.SQUARE: 90,
    AspectType.SEXTILE: 60,
    AspectType.QUINCUNX: 150,
    AspectType.SEMISEXTILE: 30,
    AspectType.SEMISQUARE: 45,
    AspectType.SESQUIQUADRATE: 135,
}
MAJOR: tuple[AspectType, ...] = (
    AspectType.CONJUNCTION,
    AspectType.OPPOSITION,
    AspectType.TRINE,
    AspectType.SQUARE,
    AspectType.SEXTILE,
)
MINOR: tuple[AspectType, ...] = (
    AspectType.QUINCUNX,
    AspectType.SEMISEXTILE,
    AspectType.SEMISQUARE,
    AspectType.SESQUIQUADRATE,
)

# Base orbs (degrees). Luminaries get +2° on majors; angles use the base; minors are tight.
BASE_ORB: dict[AspectType, float] = {
    AspectType.CONJUNCTION: 8,
    AspectType.OPPOSITION: 8,
    AspectType.TRINE: 7,
    AspectType.SQUARE: 7,
    AspectType.SEXTILE: 5,
    AspectType.QUINCUNX: 2.5,
    AspectType.SEMISEXTILE: 2,
    AspectType.SEMISQUARE: 2,
    AspectType.SESQUIQUADRATE: 2,
}
LUMINARY_BONUS = 2.0


def orb_for(a: Body, b: Body, kind: AspectType) -> float:
    orb = BASE_ORB[kind]
    if kind.is_major and (a.is_luminary or b.is_luminary):
        orb += LUMINARY_BONUS
    if a in (Body.CHIRON, Body.NORTH_NODE, Body.LILITH) or b in (
        Body.CHIRON,
        Body.NORTH_NODE,
        Body.LILITH,
    ):
        orb = min(orb, 5.0 if kind.is_major else 1.5)
    return orb


@dataclass(frozen=True, slots=True)
class Aspect:
    a: Body
    b: Body
    kind: AspectType
    orb: float  # actual deviation from exact, degrees, >= 0
    applying: bool | None  # None when either body has no motion (angles)
    exact_separation: float  # signed separation b - a in (-180, 180]

    @property
    def strength(self) -> float:
        """1.0 at exact, 0.0 at the orb limit — handy for ranking in the texts."""
        return max(0.0, 1.0 - self.orb / orb_for(self.a, self.b, self.kind))


def find_aspects(
    longitudes: dict[Body, float],
    speeds: dict[Body, float] | None = None,
    *,
    bodies: tuple[Body, ...] = ASPECTABLE,
    include_minor: bool = True,
) -> list[Aspect]:
    """All aspects among ``bodies`` present in ``longitudes``, closest orb first."""
    speeds = speeds or {}
    kinds = (*MAJOR, *MINOR) if include_minor else MAJOR
    present = [b for b in bodies if b in longitudes]
    found: list[Aspect] = []
    for i, a in enumerate(present):
        for b in present[i + 1 :]:
            if {a, b} <= {Body.ASC, Body.MC}:
                continue  # ASC–MC angle is geometry, not an aspect
            sep = delta(longitudes[a], longitudes[b])
            for kind in kinds:
                orb = abs(abs(sep) - kind.angle)
                if orb <= orb_for(a, b, kind):
                    found.append(Aspect(a, b, kind, orb, _applying(a, b, sep, kind, speeds), sep))
                    break  # one aspect per pair
    found.sort(key=lambda x: x.orb)
    return found


def _applying(
    a: Body, b: Body, sep: float, kind: AspectType, speeds: dict[Body, float]
) -> bool | None:
    """Applying when the absolute separation is moving towards the exact angle."""
    if a not in speeds or b not in speeds:
        return None
    rel = speeds[b] - speeds[a]  # how fast the signed separation b-a changes
    current = abs(sep)
    future = abs(delta(0.0, sep + rel * 0.01))
    return abs(future - kind.angle) < abs(current - kind.angle)
