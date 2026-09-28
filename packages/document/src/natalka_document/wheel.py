"""Natal wheel as SVG — a port of ``design/wheel.js`` so the PDF and the web preview draw the same chart.

Input is the engine facts dict (``natalka_engine.serialize.chart_to_dict``). Output is an SVG string;
:func:`wheel_drawing` converts it to a ReportLab drawing for the PDF.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from typing import Any

from reportlab.graphics.shapes import Drawing, Group
from svglib.svglib import svg2rlg

from .glyphs import PLANET_PATHS, SIGN_PATHS, WHEEL_BODIES

MAJOR = ("conjunction", "opposition", "trine", "square", "sextile")
ASPECT_BODIES = (*WHEEL_BODIES[:10], "asc", "mc")

ELEMENTS = ("fire", "earth", "air", "water")
ROMAN = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII")
ANGLE_LABEL = {0: "AC", 3: "IC", 6: "DC", 9: "MC"}
MONO = "JetBrains Mono"


@dataclass(frozen=True, slots=True)
class WheelTheme:
    line: str = "#C4C8DE"
    line_strong: str = "#14172B"
    glyph: str = "#14172B"
    sign: str = "#8A6A2E"
    face: str = "#FFFFFF"
    ring: str = "#F3F1EA"
    sector: str = "rgba(0,0,0,0.025)"
    label_bg: str = "#FFFFFF"
    text2: str = "#5E6382"
    astro: str = "#D6973A"
    astro_soft: str = "#FBEAD1"
    tense: str = "#D9553A"
    harmonious: str = "#2B47E0"
    neutral: str = "#9A9EBB"
    elements: dict[str, str] = field(
        default_factory=lambda: {
            "fire": "#D9553A",
            "earth": "#4C8A49",
            "air": "#3B8BD6",
            "water": "#6B5BD2",
        }
    )


LIGHT = WheelTheme()
DARK = WheelTheme(
    line="rgba(255,255,255,0.22)",
    line_strong="#F4F1E8",
    glyph="#EAD7A6",
    sign="#EAD7A6",
    face="none",
    ring="rgba(255,255,255,0.04)",
    sector="rgba(255,255,255,0.025)",
    label_bg="#10152C",
    text2="#AEB2C8",
    astro="#F0B95B",
    astro_soft="rgba(240,185,91,0.16)",
    tense="#FF7D68",
    harmonious="#86B4FF",
    neutral="#8A8FAC",
)
# ReportLab/svglib do not understand rgba(); the PDF theme uses opaque equivalents.
PDF_DARK = WheelTheme(
    line="#4A5070",
    line_strong="#F4F1E8",
    glyph="#EAD7A6",
    sign="#EAD7A6",
    face="none",
    ring="#151B33",
    sector="none",
    label_bg="#10152C",
    text2="#AEB2C8",
    astro="#F0B95B",
    astro_soft="#3A2E1A",
    tense="#FF7D68",
    harmonious="#86B4FF",
    neutral="#8A8FAC",
)
PDF_LIGHT = WheelTheme(sector="none", astro_soft="#FBEAD1")


def _norm(a: float) -> float:
    return a % 360.0


def _fmt_deg(lon: float) -> str:
    within = lon % 30
    d = int(within)
    m = round((within - d) * 60)
    if m == 60:
        d, m = d + 1, 0
    return f"{d:02d}°{m:02d}′"


class _Svg:
    def __init__(self) -> None:
        self.parts: list[str] = []

    def add(self, tag: str, **attrs: Any) -> None:
        text = attrs.pop("_text", None)
        a = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items() if v is not None)
        self.parts.append(f"<{tag} {a}>{text}</{tag}>" if text is not None else f"<{tag} {a}/>")

    def open(self, tag: str, **attrs: Any) -> None:
        a = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items() if v is not None)
        self.parts.append(f"<{tag} {a}>")

    def close(self, tag: str) -> None:
        self.parts.append(f"</{tag}>")


def _glyph(  # noqa: PLR0917
    svg: _Svg, path: str, size: float, x: float, y: float, color: str, sw: float = 1.9
) -> None:
    scale = size / 24
    svg.open("g", transform=f"translate({x - size / 2:.2f} {y - size / 2:.2f}) scale({scale:.4f})")
    svg.add(
        "path",
        d=path,
        fill="none",
        stroke=color,
        stroke_width=sw,
        stroke_linecap="round",
        stroke_linejoin="round",
    )
    svg.close("g")


def wheel_svg(  # noqa: PLR0912, PLR0915 — a single drawing routine, mirrors wheel.js
    facts: dict[str, Any],
    *,
    size: float = 480,
    detail: str = "full",
    theme: WheelTheme = LIGHT,
    highlight: str | None = None,
    aspects: bool = True,
) -> str:
    positions = {p["body"]: p for p in facts["positions"]}
    houses = facts.get("houses")
    cusps: list[float] | None = [c["longitude"] for c in houses["cusps"]] if houses else None
    asc = cusps[0] if cusps else 0.0
    unknown = cusps is None

    radius = size / 2
    cx = cy = radius

    def pt(lon: float, r: float) -> tuple[float, float]:
        a = math.radians(_norm(lon - asc))
        return cx - r * math.cos(a), cy + r * math.sin(a)

    r_outer = radius - 1
    r_zod_in = radius * 0.86
    r_tick_in = radius * 0.80 if detail == "full" else radius * 0.82
    r_planet = radius * 0.705 if detail == "full" else radius * 0.70
    r_house_out = radius * 0.53 if detail == "full" else radius * 0.54
    r_house_in = radius * 0.47 if detail == "full" else radius * 0.48
    r_aspect = radius * 0.45 if detail == "full" else radius * 0.46
    sw_thin, sw_mid, sw_strong = max(0.6, size / 900), max(0.8, size / 600), max(1.2, size / 400)
    th = theme

    svg = _Svg()
    svg.open(
        "svg",
        xmlns="http://www.w3.org/2000/svg",
        viewBox=f"0 0 {size} {size}",
        width=size,
        height=size,
    )
    svg.add("circle", cx=cx, cy=cy, r=r_outer, fill=th.face, stroke=th.line, stroke_width=sw_mid)

    # zodiac ring
    for i in range(12):
        a0, a1 = i * 30.0, i * 30.0 + 30.0
        xo0, yo0 = pt(a0, r_outer)
        xo1, yo1 = pt(a1, r_outer)
        xi1, yi1 = pt(a1, r_zod_in)
        xi0, yi0 = pt(a0, r_zod_in)
        if th.sector != "none":
            svg.add(
                "path",
                d=f"M{xo0:.2f} {yo0:.2f}A{r_outer:.2f} {r_outer:.2f} 0 0 0 {xo1:.2f} {yo1:.2f}L{xi1:.2f} {yi1:.2f}A{r_zod_in:.2f} {r_zod_in:.2f} 0 0 1 {xi0:.2f} {yi0:.2f}Z",
                fill=th.sector,
                stroke="none",
            )
        dx0, dy0 = pt(a0, r_zod_in)
        dx1, dy1 = pt(a0, r_outer)
        svg.add(
            "line",
            x1=f"{dx0:.2f}",
            y1=f"{dy0:.2f}",
            x2=f"{dx1:.2f}",
            y2=f"{dy1:.2f}",
            stroke=th.line,
            stroke_width=sw_thin,
        )
        gs = size * 0.042 if detail == "full" else size * 0.055
        gx, gy = pt(a0 + 15, (r_outer + r_zod_in) / 2)
        _glyph(svg, SIGN_PATHS[i], gs, gx, gy, th.sign or th.elements[ELEMENTS[i % 4]])
    svg.add("circle", cx=cx, cy=cy, r=r_zod_in, fill="none", stroke=th.line, stroke_width=sw_mid)

    # degree ticks
    step = 1 if detail == "full" else 5
    for d in range(0, 360, step):
        frac = 1.0 if d % 10 == 0 else 0.6 if d % 5 == 0 else 0.3
        x0, y0 = pt(d, r_zod_in)
        x1, y1 = pt(d, r_zod_in - (r_zod_in - r_tick_in) * frac)
        svg.add(
            "line",
            x1=f"{x0:.2f}",
            y1=f"{y0:.2f}",
            x2=f"{x1:.2f}",
            y2=f"{y1:.2f}",
            stroke=th.text2 if d % 10 == 0 else th.line,
            stroke_width=sw_thin,
        )
    svg.add("circle", cx=cx, cy=cy, r=r_tick_in, fill="none", stroke=th.line, stroke_width=sw_thin)

    # houses
    if not unknown and cusps:
        svg.add(
            "circle", cx=cx, cy=cy, r=r_house_out, fill=th.ring, stroke=th.line, stroke_width=sw_mid
        )
        svg.add(
            "circle", cx=cx, cy=cy, r=r_house_in, fill=th.face, stroke=th.line, stroke_width=sw_mid
        )
        for i, c in enumerate(cusps):
            is_angle = i % 3 == 0
            x0, y0 = pt(c, r_house_in)
            x1, y1 = pt(c, r_zod_in if is_angle else r_tick_in)
            svg.add(
                "line",
                x1=f"{x0:.2f}",
                y1=f"{y0:.2f}",
                x2=f"{x1:.2f}",
                y2=f"{y1:.2f}",
                stroke=th.line_strong if is_angle else th.line,
                stroke_width=sw_strong if is_angle else sw_thin,
            )
            nxt = cusps[(i + 1) % 12]
            tx, ty = pt(c + _norm(nxt - c) / 2, (r_house_out + r_house_in) / 2)
            svg.add(
                "text",
                x=f"{tx:.2f}",
                y=f"{ty:.2f}",
                text_anchor="middle",
                dominant_baseline="central",
                fill=th.text2,
                font_family=MONO,
                font_size=f"{size * (0.021 if detail == 'full' else 0.028):.2f}",
                _text=ROMAN[i],
            )
            if is_angle and detail == "full":
                lx, ly = pt(c, (r_zod_in + r_tick_in) / 2)
                svg.add(
                    "rect",
                    x=f"{lx - size * 0.022:.2f}",
                    y=f"{ly - size * 0.013:.2f}",
                    width=f"{size * 0.044:.2f}",
                    height=f"{size * 0.026:.2f}",
                    rx=f"{size * 0.006:.2f}",
                    fill=th.label_bg,
                    stroke=th.line_strong,
                    stroke_width=sw_thin,
                )
                svg.add(
                    "text",
                    x=f"{lx:.2f}",
                    y=f"{ly:.2f}",
                    text_anchor="middle",
                    dominant_baseline="central",
                    fill=th.line_strong,
                    font_family=MONO,
                    font_weight="500",
                    font_size=f"{size * 0.02:.2f}",
                    _text=ANGLE_LABEL[i],
                )
    else:
        svg.add(
            "circle", cx=cx, cy=cy, r=r_house_in, fill=th.face, stroke=th.line, stroke_width=sw_mid
        )

    # aspects
    if aspects:
        for a in facts.get("aspects", []):
            if a["type"] not in MAJOR or a["type"] == "conjunction":
                continue
            if a["a"] not in ASPECT_BODIES or a["b"] not in ASPECT_BODIES:
                continue
            x0, y0 = pt(positions[a["a"]]["longitude"], r_aspect)
            x1, y1 = pt(positions[a["b"]]["longitude"], r_aspect)
            color = {"tense": th.tense, "harmonious": th.harmonious}.get(a["nature"], th.neutral)
            tight = a["orb"] < 2
            svg.add(
                "line",
                x1=f"{x0:.2f}",
                y1=f"{y0:.2f}",
                x2=f"{x1:.2f}",
                y2=f"{y1:.2f}",
                stroke=color,
                stroke_width=sw_strong if tight else sw_mid,
                stroke_opacity="0.9" if tight else "0.55",
            )

    # planets with collision avoidance
    shown = [p for p in facts["positions"] if p["body"] in WHEEL_BODIES]
    items = [
        {
            "body": p["body"],
            "lon": p["longitude"],
            "disp": p["longitude"],
            "retro": p.get("retrograde"),
        }
        for p in shown
    ]
    items.sort(key=lambda p: _norm(p["lon"] - asc))
    min_sep = 12.0 if detail == "full" else 13.0
    for _ in range(8):
        for i in range(1, len(items)):
            prev, cur = items[i - 1], items[i]
            gap = _norm(cur["disp"] - prev["disp"])
            if gap < min_sep:
                push = (min_sep - gap) / 2
                prev["disp"] = _norm(prev["disp"] - push)
                cur["disp"] = _norm(cur["disp"] + push)
    # cluster consecutive planets and give each member of a cluster its own label ring
    cluster: list[dict[str, Any]] = []
    for i, p in enumerate(items):
        before = items[i - 1] if i else None
        if before is not None and _norm(p["disp"] - before["disp"]) < 17:
            cluster.append(p)
        else:
            cluster = [p]
        p["lvl"] = len(cluster) - 1

    for p in items:
        is_sun = p["body"] == "sun"
        is_hl = highlight == p["body"]
        color = th.astro if (is_sun or is_hl) else th.glyph
        ax, ay = pt(p["lon"], r_tick_in)
        gx, gy = pt(p["disp"], r_planet)
        px, py = pt(p["disp"], r_planet + size * (0.04 if detail == "full" else 0.05))
        svg.add(
            "line",
            x1=f"{ax:.2f}",
            y1=f"{ay:.2f}",
            x2=f"{px:.2f}",
            y2=f"{py:.2f}",
            stroke=th.astro if (is_sun or is_hl) else th.line,
            stroke_width=sw_thin,
        )
        svg.add(
            "circle", cx=f"{ax:.2f}", cy=f"{ay:.2f}", r=f"{max(1.5, size * 0.006):.2f}", fill=color
        )
        gs = size * 0.045 if detail == "full" else size * 0.06
        if is_sun or is_hl:
            svg.add(
                "circle", cx=f"{gx:.2f}", cy=f"{gy:.2f}", r=f"{gs * 0.9:.2f}", fill=th.astro_soft
            )
        _glyph(svg, PLANET_PATHS[p["body"]], gs, gx, gy, color, 2.0 if is_sun else 1.9)
        # in a dense cluster only the first two degrees fit; the rest are in the positions table
        if detail == "full" and p["lvl"] < 2:
            tx, ty = pt(p["disp"], r_planet - radius * (0.072 + p["lvl"] * 0.062))
            label = _fmt_deg(p["lon"]) + (" R" if p["retro"] else "")
            svg.add(
                "text",
                x=f"{tx:.2f}",
                y=f"{ty:.2f}",
                text_anchor="middle",
                dominant_baseline="central",
                fill=th.astro if (is_sun or is_hl) else th.text2,
                font_family=MONO,
                font_size=f"{size * 0.0145:.2f}",
                _text=label,
            )

    svg.close("svg")
    return "".join(svg.parts)


def wheel_drawing(
    facts: dict[str, Any], *, size_pt: float, theme: WheelTheme = PDF_LIGHT, **kw: Any
) -> Drawing:
    """The wheel as a ReportLab drawing that is exactly ``size_pt`` wide and high.

    svglib converts SVG user units to points (1px = 0.75pt) and keeps a small margin, so the raw
    drawing is neither the requested size nor anchored at the origin. We normalise both here;
    otherwise every caller has to compensate and centring silently drifts.
    """
    svg = wheel_svg(facts, size=size_pt, theme=theme, **kw)
    raw: Drawing | None = svg2rlg(io.StringIO(svg))
    if raw is None:  # pragma: no cover — svglib returns None only on parse failure
        raise RuntimeError("wheel SVG could not be parsed")
    x0, y0, x1, y1 = raw.getBounds()
    span = max(x1 - x0, y1 - y0)
    scale = size_pt / span if span else 1.0
    inner = Group(*raw.contents)
    inner.transform = (scale, 0.0, 0.0, scale, -x0 * scale, -y0 * scale)
    out = Drawing(size_pt, size_pt)
    out.add(inner)
    return out
