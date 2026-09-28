"""Natal chart computation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time

from . import ephemeris
from .aspects import Aspect, find_aspects
from .bodies import ANGLES, EXTRA_POINTS, PLANETS, Body, Sign, norm360
from .timeutil import LocalMoment, to_utc

HIGH_LATITUDE = 66.0  # Placidus degenerates beyond the polar circles


@dataclass(frozen=True, slots=True)
class NatalInput:
    birth_date: date
    birth_time: time | None  # None = unknown → noon, no houses
    zone: str  # IANA time zone of the birth place
    latitude: float
    longitude: float
    house_system: str = "placidus"

    @property
    def unknown_time(self) -> bool:
        return self.birth_time is None


@dataclass(frozen=True, slots=True)
class Position:
    body: Body
    longitude: float
    latitude: float
    speed: float
    house: int | None  # 1..12, None when houses are not computed

    @property
    def sign(self) -> Sign:
        return Sign.of(self.longitude)

    @property
    def degree_in_sign(self) -> float:
        return self.longitude % 30

    @property
    def retrograde(self) -> bool:
        return self.speed < 0


@dataclass(frozen=True, slots=True)
class Houses:
    system: str
    cusps: tuple[float, ...]  # 12 entries, index 0 = house 1 (= ASC for quadrant systems)
    asc: float
    mc: float
    vertex: float

    def house_of(self, longitude: float) -> int:
        return house_of(longitude, self.cusps)


@dataclass(frozen=True, slots=True)
class NatalChart:
    input: NatalInput
    moment: LocalMoment
    jd: float
    positions: dict[Body, Position]
    houses: Houses | None
    aspects: list[Aspect]
    day_chart: bool | None
    warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def longitudes(self) -> dict[Body, float]:
        return {b: p.longitude for b, p in self.positions.items()}

    def position(self, body: Body) -> Position:
        return self.positions[body]


def house_of(longitude: float, cusps: tuple[float, ...]) -> int:
    """1-based house number for a longitude, given 12 cusps in zodiacal order."""
    lon = norm360(longitude)
    for i in range(12):
        start, end = cusps[i], cusps[(i + 1) % 12]
        span = norm360(end - start)
        if norm360(lon - start) < span:
            return i + 1
    return 12


def compute_natal(inp: NatalInput) -> NatalChart:
    """Compute a full natal chart. Pure: same input → same output."""
    moment = to_utc(inp.birth_date, inp.birth_time, inp.zone)
    jd = ephemeris.julian_day(moment.utc)
    warnings: list[str] = []
    if moment.ambiguous:
        warnings.append("ambiguous_local_time")
    if moment.nonexistent:
        warnings.append("nonexistent_local_time")

    houses: Houses | None = None
    if not inp.unknown_time:
        system = inp.house_system
        if abs(inp.latitude) > HIGH_LATITUDE and system in ("placidus", "koch"):
            system = "porphyry"
            warnings.append("house_system_fallback_porphyry")
        hd = ephemeris.houses(jd, inp.latitude, inp.longitude, system)
        houses = Houses(system=hd.system, cusps=hd.cusps, asc=hd.asc, mc=hd.mc, vertex=hd.vertex)

    raw: dict[Body, ephemeris.BodyPosition] = {}
    for body in (*PLANETS, Body.CHIRON, Body.NORTH_NODE, Body.LILITH):
        try:
            raw[body] = ephemeris.body_position(body, jd)
        except ephemeris.BodyUnavailableError:
            warnings.append(f"unavailable_{body.value}")

    positions: dict[Body, Position] = {}

    def add(body: Body, lon: float, lat: float = 0.0, speed: float = 0.0) -> None:
        positions[body] = Position(
            body=body,
            longitude=norm360(lon),
            latitude=lat,
            speed=speed,
            house=houses.house_of(lon) if houses else None,
        )

    for body, bp in raw.items():
        add(body, bp.longitude, bp.latitude, bp.speed)
    if Body.NORTH_NODE in raw:
        nn = raw[Body.NORTH_NODE]
        add(Body.SOUTH_NODE, nn.longitude + 180, -nn.latitude, nn.speed)

    day_chart: bool | None = None
    if houses:
        add(Body.ASC, houses.asc)
        add(Body.MC, houses.mc)
        add(Body.DSC, houses.asc + 180)
        add(Body.IC, houses.mc + 180)
        add(Body.VERTEX, houses.vertex)
        sun_house = positions[Body.SUN].house
        day_chart = sun_house is not None and sun_house >= 7  # above the horizon
        sun, moon = positions[Body.SUN].longitude, positions[Body.MOON].longitude
        fortune = houses.asc + moon - sun if day_chart else houses.asc + sun - moon
        add(Body.PARS_FORTUNAE, fortune)

    longitudes = {b: p.longitude for b, p in positions.items()}
    speeds = {b: p.speed for b, p in positions.items() if b in raw or b == Body.SOUTH_NODE}
    aspects = find_aspects(longitudes, speeds)
    return NatalChart(
        input=inp,
        moment=moment,
        jd=jd,
        positions=positions,
        houses=houses,
        aspects=aspects,
        day_chart=day_chart,
        warnings=tuple(warnings),
    )


def utc_datetime(chart: NatalChart) -> datetime:
    return chart.moment.utc


__all__ = [
    "ANGLES",
    "EXTRA_POINTS",
    "Houses",
    "NatalChart",
    "NatalInput",
    "Position",
    "compute_natal",
    "house_of",
]
