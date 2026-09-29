"""Zodiac signs, bodies and chart points — plain enums shared by every engine module."""

from __future__ import annotations

from enum import IntEnum, StrEnum


class Element(StrEnum):
    FIRE = "fire"
    EARTH = "earth"
    AIR = "air"
    WATER = "water"


class Modality(StrEnum):
    CARDINAL = "cardinal"
    FIXED = "fixed"
    MUTABLE = "mutable"


class Sign(IntEnum):
    ARIES = 0
    TAURUS = 1
    GEMINI = 2
    CANCER = 3
    LEO = 4
    VIRGO = 5
    LIBRA = 6
    SCORPIO = 7
    SAGITTARIUS = 8
    CAPRICORN = 9
    AQUARIUS = 10
    PISCES = 11

    @property
    def element(self) -> Element:
        return (Element.FIRE, Element.EARTH, Element.AIR, Element.WATER)[self % 4]

    @property
    def modality(self) -> Modality:
        return (Modality.CARDINAL, Modality.FIXED, Modality.MUTABLE)[self % 3]

    @property
    def key(self) -> str:
        return self.name.lower()

    @classmethod
    def of(cls, longitude: float) -> Sign:
        return cls(int(longitude % 360 // 30))


class Body(StrEnum):
    """Planets and computed points. Values are stable identifiers used in JSON."""

    SUN = "sun"
    MOON = "moon"
    MERCURY = "mercury"
    VENUS = "venus"
    MARS = "mars"
    JUPITER = "jupiter"
    SATURN = "saturn"
    URANUS = "uranus"
    NEPTUNE = "neptune"
    PLUTO = "pluto"
    CHIRON = "chiron"
    NORTH_NODE = "north_node"  # true node
    SOUTH_NODE = "south_node"
    LILITH = "lilith"  # mean apogee
    ASC = "asc"
    MC = "mc"
    DSC = "dsc"
    IC = "ic"
    VERTEX = "vertex"
    PARS_FORTUNAE = "pars_fortunae"

    @property
    def is_planet(self) -> bool:
        return self in PLANETS

    @property
    def is_luminary(self) -> bool:
        return self in (Body.SUN, Body.MOON)


PLANETS: tuple[Body, ...] = (
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
)
"""The ten classical bodies, in traditional order."""

EXTRA_POINTS: tuple[Body, ...] = (Body.CHIRON, Body.NORTH_NODE, Body.SOUTH_NODE, Body.LILITH)
ANGLES: tuple[Body, ...] = (Body.ASC, Body.MC, Body.DSC, Body.IC)
ASPECTABLE: tuple[Body, ...] = (*PLANETS, Body.CHIRON, Body.NORTH_NODE, Body.ASC, Body.MC)
"""Bodies that take part in the natal aspect grid (South Node/DSC/IC are mirrors)."""

OUTER_PLANETS: tuple[Body, ...] = (Body.JUPITER, Body.SATURN, Body.URANUS, Body.NEPTUNE, Body.PLUTO)
"""Transiting bodies whose passages are slow enough to be meaningful with day precision."""

PERSONAL_PLANETS: tuple[Body, ...] = (Body.SUN, Body.MERCURY, Body.VENUS, Body.MARS)
"""Transiting bodies fast enough to say something about a single week. The Moon is left out on
purpose: it makes four exact aspects a day, which is noise at this length."""

# Traditional sign rulers (modern), used for "ruler of house X" in the facts JSON.
RULERS: dict[Sign, Body] = {
    Sign.ARIES: Body.MARS,
    Sign.TAURUS: Body.VENUS,
    Sign.GEMINI: Body.MERCURY,
    Sign.CANCER: Body.MOON,
    Sign.LEO: Body.SUN,
    Sign.VIRGO: Body.MERCURY,
    Sign.LIBRA: Body.VENUS,
    Sign.SCORPIO: Body.PLUTO,
    Sign.SAGITTARIUS: Body.JUPITER,
    Sign.CAPRICORN: Body.SATURN,
    Sign.AQUARIUS: Body.URANUS,
    Sign.PISCES: Body.NEPTUNE,
}


def norm360(deg: float) -> float:
    """Normalise an angle to [0, 360)."""
    return deg % 360.0


def delta(a: float, b: float) -> float:
    """Smallest signed angular distance from ``a`` to ``b`` in (-180, 180]."""
    d = (b - a + 180.0) % 360.0 - 180.0
    return 180.0 if d == -180.0 else d


def format_degree(longitude: float, *, seconds: bool = False) -> str:
    """``24°24′`` (or ``24°24′11″``) within the sign."""
    within = longitude % 30
    total = round(within * 3600)
    d, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if d == 30:  # rounding pushed us to the next sign boundary
        d, m, s = 29, 59, 59
    return f"{d:02d}°{m:02d}′{s:02d}″" if seconds else f"{d:02d}°{m:02d}′"
