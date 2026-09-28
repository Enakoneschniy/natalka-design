"""Derived "main lines" of a chart (METHODOLOGY.md step 2), computed — not guessed by the model."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from itertools import combinations

from .aspects import Aspect, AspectType
from .bodies import PLANETS, RULERS, Body, Element, Modality, Sign, delta
from .chart import NatalChart

ANGULAR_ORB = 8.0
WEIGHTS: dict[Body, int] = {Body.SUN: 2, Body.MOON: 2}


@dataclass(frozen=True, slots=True)
class Configuration:
    kind: str  # grand_trine | t_square | grand_cross | yod | stellium
    bodies: tuple[Body, ...]
    focus: Body | None = None  # apex of a T-square / yod
    note: str = ""


@dataclass(frozen=True, slots=True)
class Analysis:
    elements: dict[Element, int]
    modalities: dict[Modality, int]
    dominant_element: Element
    weakest_element: Element
    dominant_modality: Modality
    stelliums: tuple[Configuration, ...]
    angular: tuple[tuple[Body, Body], ...]  # (planet, angle)
    configurations: tuple[Configuration, ...]
    house_rulers: dict[int, tuple[Body, int | None]]  # house → (ruler, house the ruler sits in)
    chart_ruler: Body | None
    strongest_aspects: tuple[Aspect, ...] = field(default_factory=tuple)


def analyse(chart: NatalChart) -> Analysis:  # noqa: PLR0912 — one pass over the chart, kept linear on purpose
    pos = chart.positions
    planets = [pos[b] for b in PLANETS if b in pos]

    elements: Counter[Element] = Counter()
    modalities: Counter[Modality] = Counter()
    for p in planets:
        w = WEIGHTS.get(p.body, 1)
        elements[p.sign.element] += w
        modalities[p.sign.modality] += w
    if chart.houses:
        asc_sign = Sign.of(chart.houses.asc)
        elements[asc_sign.element] += 1
        modalities[asc_sign.modality] += 1
    for e in Element:
        elements.setdefault(e, 0)
    for m in Modality:
        modalities.setdefault(m, 0)

    stelliums: list[Configuration] = []
    by_sign: dict[Sign, list[Body]] = {}
    by_house: dict[int, list[Body]] = {}
    for p in planets:
        by_sign.setdefault(p.sign, []).append(p.body)
        if p.house is not None:
            by_house.setdefault(p.house, []).append(p.body)
    for sign, bodies in by_sign.items():
        if len(bodies) >= 3:
            stelliums.append(Configuration("stellium", tuple(bodies), note=f"sign:{sign.key}"))
    for house, bodies in by_house.items():
        if len(bodies) >= 3:
            stelliums.append(Configuration("stellium", tuple(bodies), note=f"house:{house}"))

    angular: list[tuple[Body, Body]] = []
    if chart.houses:
        for angle in (Body.ASC, Body.MC, Body.DSC, Body.IC):
            a_lon = pos[angle].longitude
            for p in planets:
                if abs(delta(p.longitude, a_lon)) <= ANGULAR_ORB:
                    angular.append((p.body, angle))

    configurations = _configurations(chart.aspects)

    house_rulers: dict[int, tuple[Body, int | None]] = {}
    chart_ruler: Body | None = None
    if chart.houses:
        for i, cusp in enumerate(chart.houses.cusps, start=1):
            ruler = RULERS[Sign.of(cusp)]
            house_rulers[i] = (ruler, pos[ruler].house if ruler in pos else None)
        chart_ruler = house_rulers[1][0]

    majors = [a for a in chart.aspects if a.kind.is_major and a.a in PLANETS and a.b in PLANETS]
    strongest = tuple(sorted(majors, key=lambda a: a.orb)[:8])

    return Analysis(
        elements=dict(elements),
        modalities=dict(modalities),
        dominant_element=max(Element, key=lambda e: (elements[e], -list(Element).index(e))),
        weakest_element=min(Element, key=lambda e: (elements[e], list(Element).index(e))),
        dominant_modality=max(Modality, key=lambda m: (modalities[m], -list(Modality).index(m))),
        stelliums=tuple(stelliums),
        angular=tuple(angular),
        configurations=configurations,
        house_rulers=house_rulers,
        chart_ruler=chart_ruler,
        strongest_aspects=strongest,
    )


def _configurations(aspects: list[Aspect]) -> tuple[Configuration, ...]:
    """Grand trines, T-squares, grand crosses and yods among planets."""
    planets = set(PLANETS)
    pairs: dict[frozenset[Body], AspectType] = {
        frozenset((a.a, a.b)): a.kind for a in aspects if a.a in planets and a.b in planets
    }

    def has(x: Body, y: Body, kind: AspectType) -> bool:
        return pairs.get(frozenset((x, y))) == kind

    bodies = sorted({b for pair in pairs for b in pair}, key=list(PLANETS).index)
    found: list[Configuration] = []
    seen: set[tuple[str, tuple[Body, ...]]] = set()

    def add(kind: str, members: tuple[Body, ...], focus: Body | None = None) -> None:
        key = (kind, tuple(sorted(members, key=list(PLANETS).index)))
        if key not in seen:
            seen.add(key)
            found.append(Configuration(kind, key[1], focus))

    for x, y, z in combinations(bodies, 3):
        if (
            has(x, y, AspectType.TRINE)
            and has(y, z, AspectType.TRINE)
            and has(x, z, AspectType.TRINE)
        ):
            add("grand_trine", (x, y, z))
        for apex, (p, q) in ((x, (y, z)), (y, (x, z)), (z, (x, y))):
            if (
                has(p, q, AspectType.OPPOSITION)
                and has(apex, p, AspectType.SQUARE)
                and has(apex, q, AspectType.SQUARE)
            ):
                add("t_square", (x, y, z), focus=apex)
            if (
                has(p, q, AspectType.SEXTILE)
                and has(apex, p, AspectType.QUINCUNX)
                and has(apex, q, AspectType.QUINCUNX)
            ):
                add("yod", (x, y, z), focus=apex)
    for a, b, c, d in combinations(bodies, 4):
        opp = [(p, q) for p, q in combinations((a, b, c, d), 2) if has(p, q, AspectType.OPPOSITION)]
        sq = sum(1 for p, q in combinations((a, b, c, d), 2) if has(p, q, AspectType.SQUARE))
        if len(opp) == 2 and sq == 4:
            add("grand_cross", (a, b, c, d))
    # A T-square contained in a grand cross is not reported separately.
    crosses = [set(c.bodies) for c in found if c.kind == "grand_cross"]
    return tuple(
        c for c in found if not (c.kind == "t_square" and any(set(c.bodies) <= x for x in crosses))
    )
