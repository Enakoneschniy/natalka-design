"""Turn the engine JSON into the fact sheet the model is allowed to see.

The model never receives anything the person typed beyond their first name and gender — no email,
no exact coordinates, no free text. It receives what the engine computed, already phrased in the
document language, plus counts (elements, modalities, house occupancy) worked out here rather than
by the model, which cannot be trusted to add up twelve numbers reliably.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

SIGNS = (
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
)  # fmt: skip

ELEMENTS = ("fire", "earth", "air", "water")
MODALITIES = ("cardinal", "fixed", "mutable")

#: Bodies that carry weight in the element/modality balance. Angles and calculated points are left
#: out on purpose: counting the Ascendant as "a planet in fire" inflates every balance.
WEIGHTED = (
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
    "uranus", "neptune", "pluto",
)  # fmt: skip


def element_of(sign: str) -> str:
    return ELEMENTS[SIGNS.index(sign) % 4]


def modality_of(sign: str) -> str:
    return MODALITIES[SIGNS.index(sign) % 3]


def balance(facts: dict[str, Any]) -> dict[str, dict[str, int]]:
    """How many of the ten planets sit in each element and each modality."""
    elements: Counter[str] = Counter()
    modalities: Counter[str] = Counter()
    for position in facts.get("positions", []):
        if position["body"] not in WEIGHTED:
            continue
        sign = position["sign"]
        elements[element_of(sign)] += 1
        modalities[modality_of(sign)] += 1
    return {
        "elements": {e: elements.get(e, 0) for e in ELEMENTS},
        "modalities": {m: modalities.get(m, 0) for m in MODALITIES},
    }


def angular_bodies(facts: dict[str, Any], orb: float = 8.0) -> list[str]:
    """Planets within ``orb`` of an angle — the loudest placements in a chart."""
    houses = facts.get("houses")
    if not houses:
        return []
    angles = {"asc": houses["asc"], "mc": houses["mc"]}
    angles["dsc"] = (angles["asc"] + 180) % 360
    angles["ic"] = (angles["mc"] + 180) % 360

    out: list[str] = []
    for position in facts.get("positions", []):
        if position["body"] not in WEIGHTED:
            continue
        for angle, longitude in angles.items():
            delta = abs((position["longitude"] - longitude + 180) % 360 - 180)
            if delta <= orb:
                out.append(f"{position['body']}@{angle}({delta:.1f}°)")
    return out


def _position_line(position: dict[str, Any]) -> str:
    house = position.get("house")
    retro = " R" if position.get("retrograde") else ""
    place = f", house {house}" if house else ""
    return f"{position['body']}: {position['degree']} {position['sign']}{place}{retro}"


def _aspect_line(aspect: dict[str, Any]) -> str:
    # Arrows rather than "applying"/"separating": the model copied those English words straight
    # into Russian readings, and a symbol has nothing to copy.
    direction = ""
    if aspect.get("applying") is True:
        direction = " →"
    elif aspect.get("applying") is False:
        direction = " ←"
    return f"{aspect['a']} {aspect['type']} {aspect['b']} (orb {aspect['orb']:.1f}°{direction})"


def fact_sheet(facts: dict[str, Any], transits: list[dict[str, Any]] | None = None) -> str:
    """A compact, unambiguous digest of the chart. Plain text beats JSON here: the model quotes
    degrees back into the reading, and a flat line is harder to garble than nested braces."""
    lines: list[str] = []
    birth = facts["birth"]
    lines.append(
        f"Birth: {birth['date']} {birth['time'] or 'time unknown'} "
        f"({birth['zone']}, {birth['utc_offset']}), "
        f"lat {birth['latitude']:.2f}, lon {birth['longitude']:.2f}"
    )
    if birth["unknown_time"]:
        lines.append("NO BIRTH TIME: houses, Ascendant and MC are not available for this chart.")

    lines.append("")
    lines.append("POSITIONS")
    lines.extend(_position_line(p) for p in facts.get("positions", []))

    houses = facts.get("houses")
    if houses:
        lines.append("")
        lines.append(f"HOUSES ({houses['system']})")
        lines.extend(f"{c['house']}: {c['degree']} {c['sign']}" for c in houses["cusps"])

    counts = balance(facts)
    lines.append("")
    lines.append("BALANCE (ten planets)")
    lines.append(", ".join(f"{k} {v}" for k, v in counts["elements"].items()))
    lines.append(", ".join(f"{k} {v}" for k, v in counts["modalities"].items()))

    angular = angular_bodies(facts)
    if angular:
        lines.append(f"ANGULAR: {', '.join(angular)}")

    analysis = facts.get("analysis") or {}
    for key, value in analysis.items():
        if value:
            lines.append(f"{key.upper()}: {value}")

    aspects = facts.get("aspects", [])
    if aspects:
        lines.append("")
        lines.append("ASPECTS (tightest first; → still closing, ← already past exact)")
        ordered = sorted(aspects, key=lambda a: a["orb"])
        lines.extend(_aspect_line(a) for a in ordered[:40])

    if transits:
        lines.append("")
        lines.append("TRANSITS (exact dates computed by the engine)")
        for event in transits:
            lines.append(
                f"{event.get('date', '')}: {event.get('kind', '')} "
                f"{event.get('body', '')} {event.get('aspect', '')} "
                f"{event.get('target', '')}".strip()
            )

    if facts.get("warnings"):
        lines.append("")
        lines.append(f"WARNINGS: {'; '.join(facts['warnings'])}")

    return "\n".join(lines)


def synastry_sheet(data: dict[str, Any], *, first_name: str, second_name: str) -> str:
    """Both charts and what they do to each other.

    Named rather than numbered: "Sun of Оксана trine Moon of Ігор" is a sentence the model can
    write from, while "first/second" invites it to mix the two people up halfway down the page.
    """
    lines = [f"CHART A — {first_name}", fact_sheet(data["first"]), ""]
    lines += [f"CHART B — {second_name}", fact_sheet(data["second"]), ""]

    contacts = data.get("cross_aspects", [])
    if contacts:
        lines.append("CONTACTS BETWEEN THE TWO CHARTS (tightest first)")
        lines.append(f"Read as: <body> of {first_name} — aspect — <body> of {second_name}")
        for c in contacts[:40]:
            lines.append(
                f"{c['a']} of {first_name} {c['type']} {c['b']} of {second_name} "
                f"(orb {c['orb']:.1f}°, {c['nature']})"
            )

    overlay = data.get("overlay") or {}
    in_b = overlay.get("first_in_second_houses") or {}
    in_a = overlay.get("second_in_first_houses") or {}
    if in_b:
        lines.append("")
        lines.append(f"WHERE {first_name} LANDS IN THE LIFE OF {second_name} (house numbers)")
        lines.append(", ".join(f"{body} → {house}" for body, house in in_b.items()))
    if in_a:
        lines.append("")
        lines.append(f"WHERE {second_name} LANDS IN THE LIFE OF {first_name} (house numbers)")
        lines.append(", ".join(f"{body} → {house}" for body, house in in_a.items()))

    return "\n".join(lines)
