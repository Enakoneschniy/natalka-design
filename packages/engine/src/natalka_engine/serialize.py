"""Chart → plain JSON-able dict. This is the *only* thing the LLM ever sees about a chart."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from .analysis import Analysis, analyse
from .bodies import Body, Sign, format_degree
from .chart import NatalChart
from .timeutil import format_offset
from .transits import Ingress, TransitEvent, TransitHit

SCHEMA_VERSION = 1


def chart_to_dict(chart: NatalChart, *, analysis: Analysis | None = None) -> dict[str, Any]:
    analysis = analysis or analyse(chart)
    inp = chart.input
    positions = []
    for body, p in chart.positions.items():
        positions.append(
            {
                "body": body.value,
                "sign": p.sign.key,
                "longitude": round(p.longitude, 4),
                "degree": format_degree(p.longitude),
                "degree_in_sign": round(p.degree_in_sign, 4),
                "house": p.house,
                "retrograde": p.retrograde if body.is_planet or body == Body.CHIRON else None,
                "speed": round(p.speed, 5),
                "latitude": round(p.latitude, 4),
            }
        )
    houses = None
    if chart.houses:
        houses = {
            "system": chart.houses.system,
            "cusps": [
                {
                    "house": i + 1,
                    "longitude": round(c, 4),
                    "sign": _sign_key(c),
                    "degree": format_degree(c),
                }
                for i, c in enumerate(chart.houses.cusps)
            ],
            "asc": round(chart.houses.asc, 4),
            "mc": round(chart.houses.mc, 4),
            "vertex": round(chart.houses.vertex, 4),
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "birth": {
            "date": inp.birth_date.isoformat(),
            "time": inp.birth_time.strftime("%H:%M") if inp.birth_time else None,
            "unknown_time": inp.unknown_time,
            "zone": inp.zone,
            "utc": chart.moment.utc.isoformat(),
            "utc_offset": format_offset(chart.moment.utc_offset),
            "latitude": inp.latitude,
            "longitude": inp.longitude,
            "julian_day": round(chart.jd, 6),
        },
        "day_chart": chart.day_chart,
        "positions": positions,
        "houses": houses,
        "aspects": [
            {
                "a": a.a.value,
                "b": a.b.value,
                "type": a.kind.value,
                "nature": a.kind.nature,
                "orb": round(a.orb, 3),
                "applying": a.applying,
                "strength": round(a.strength, 3),
            }
            for a in chart.aspects
        ],
        "analysis": {
            "elements": {e.value: n for e, n in analysis.elements.items()},
            "modalities": {m.value: n for m, n in analysis.modalities.items()},
            "dominant_element": analysis.dominant_element.value,
            "weakest_element": analysis.weakest_element.value,
            "dominant_modality": analysis.dominant_modality.value,
            "stelliums": [
                {"bodies": [b.value for b in c.bodies], "where": c.note} for c in analysis.stelliums
            ],
            "angular": [{"body": b.value, "angle": a.value} for b, a in analysis.angular],
            "configurations": [
                {
                    "kind": c.kind,
                    "bodies": [b.value for b in c.bodies],
                    "focus": c.focus.value if c.focus else None,
                }
                for c in analysis.configurations
            ],
            "house_rulers": {
                str(h): {"ruler": r.value, "in_house": hh}
                for h, (r, hh) in analysis.house_rulers.items()
            },
            "chart_ruler": analysis.chart_ruler.value if analysis.chart_ruler else None,
        },
        "warnings": list(chart.warnings),
    }


def events_to_list(events: list[TransitEvent]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for ev in events:
        if isinstance(ev, Ingress):
            out.append(
                {
                    "kind": "ingress",
                    "body": ev.body.value,
                    "sign": ev.sign.key,
                    "from_sign": ev.from_sign.key,
                    "date": _date(ev.when),
                    "retrograde": ev.retrograde,
                }
            )
        elif isinstance(ev, TransitHit):
            out.append(
                {
                    "kind": "aspect",
                    "body": ev.body.value,
                    "target": ev.target.value,
                    "aspect": ev.aspect.value,
                    "date": _date(ev.when),
                    "retrograde": ev.retrograde,
                    "pass": ev.pass_no,
                    "passes": ev.passes,
                }
            )
    return out


def _date(dt: datetime) -> str:
    return dt.date().isoformat()


def _sign_key(lon: float) -> str:
    return Sign.of(lon).key
