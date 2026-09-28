"""Per-section page backgrounds: a faint motif in the corner and a running side label.

Everything is drawn under the text at low opacity on warm paper, so it stays printable.
Themes are derived from section ids (``natal.sun`` → ``natal``).
"""

from __future__ import annotations

import io
import math
import random
from dataclasses import dataclass
from itertools import pairwise

from reportlab.graphics import renderPDF
from reportlab.lib.colors import HexColor
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas
from svglib.svglib import svg2rlg

from . import styles as st
from .glyphs import PLANET_PATHS, SIGN_PATHS

PAPER = HexColor("#FBF8F1")
MOTIF = HexColor("#B08E4F")
MOTIF_INK = HexColor("#1B2545")

THEMES = ("cover", "toc", "chart", "intro", "natal", "love", "work", "transits", "summary")


@dataclass(frozen=True, slots=True)
class PageTheme:
    key: str
    label: str = ""  # running side label, e.g. "II · Особисте життя"
    opener: bool = False  # first page of a level-1 section: larger motif


def theme_for(section_id: str) -> str:
    head = section_id.split(".", 1)[0]
    if head in ("ps", "summary"):
        return "summary"
    return head if head in THEMES else "intro"


def _svg_drawing(inner: str, size: float, view: int = 24) -> object:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view} {view}" width="{size}" height="{size}">{inner}</svg>'
    return svg2rlg(io.StringIO(svg))


def _glyph(  # noqa: PLR0917
    canv: Canvas, path: str, size: float, x: float, y: float, color: str, sw: float = 1.2
) -> None:
    d = _svg_drawing(
        f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>',
        size,
    )
    renderPDF.draw(d, canv, x, y)


def paper(canv: Canvas, w: float, h: float) -> None:
    canv.setFillColor(PAPER)
    canv.rect(0, 0, w, h, stroke=0, fill=1)


def side_label(canv: Canvas, w: float, h: float, text: str) -> None:
    """Section name running down the outer edge, like a book's thumb index."""
    if not text:
        return
    canv.saveState()
    canv.setFillColor(MOTIF)
    canv.setFillAlpha(0.7)
    canv.setFont(st.SANS, 7)
    canv.translate(w - 0.75 * cm, h - 2.4 * cm)
    canv.rotate(-90)
    canv.drawString(0, 0, "   ".join(text.upper()))
    canv.restoreState()


def motif(canv: Canvas, w: float, h: float, theme: str, opener: bool) -> None:  # noqa: PLR0912, PLR0915
    """Corner motif for a theme. ``opener`` draws it large across the top; otherwise a small corner mark."""
    canv.saveState()
    rnd = random.Random(hash(theme) & 0xFFFF)
    alpha = 0.09 if opener else 0.07
    scale = 1.0 if opener else 0.55
    canv.setStrokeColor(MOTIF)
    canv.setFillColor(MOTIF)
    canv.setStrokeAlpha(alpha)
    canv.setFillAlpha(alpha)
    canv.setLineWidth(0.8)
    # anchor just outside the top-right corner so motifs stay in the margins and bleed off the edge
    cx, cy = w + 0.6 * cm, h + 0.4 * cm
    if theme in ("chart", "natal"):
        r = 7.4 * cm * scale
        canv.circle(cx, cy, r, stroke=1, fill=0)
        canv.circle(cx, cy, r * 0.84, stroke=1, fill=0)
        canv.circle(cx, cy, r * 0.5, stroke=1, fill=0)
        for k in range(12):
            a = math.radians(k * 30)
            canv.line(
                cx + r * 0.84 * math.cos(a),
                cy + r * 0.84 * math.sin(a),
                cx + r * math.cos(a),
                cy + r * math.sin(a),
            )
            gs = r * 0.11
            gx, gy = (
                cx + r * 0.92 * math.cos(a + math.radians(15)),
                cy + r * 0.92 * math.sin(a + math.radians(15)),
            )
            _glyph(canv, SIGN_PATHS[k], gs, gx - gs / 2, gy - gs / 2, "#B08E4F", 1.6)
        for _ in range(60):
            a, rr = rnd.random() * math.tau, r * 0.5 * math.sqrt(rnd.random())
            canv.circle(
                cx + rr * math.cos(a),
                cy + rr * math.sin(a),
                0.6 + rnd.random() * 0.8,
                stroke=0,
                fill=1,
            )
    elif theme == "love":
        size = 7.5 * cm * scale
        _glyph(canv, PLANET_PATHS["venus"], size, cx - size * 0.6, cy - size * 0.75, "#B08E4F", 0.9)
        size2 = size * 0.42
        _glyph(
            canv, PLANET_PATHS["moon"], size2, cx - size * 1.15, cy - size * 0.35, "#B08E4F", 0.9
        )
    elif theme == "work":
        size = 7.5 * cm * scale
        _glyph(
            canv, PLANET_PATHS["saturn"], size, cx - size * 0.6, cy - size * 0.75, "#B08E4F", 0.9
        )
        canv.setLineWidth(0.6)
        canv.line(
            cx - size * 1.3, cy - size * 0.12, cx - size * 0.62, cy - size * 0.12
        )  # the MC horizon
        canv.setFont(st.MONO, 8 * (1.6 if opener else 1))
        canv.drawString(cx - size * 1.3, cy - size * 0.1 + 3, "MC")
    elif theme == "transits":
        r0 = 3.0 * cm * scale
        for k in range(4):
            r = r0 * (1 + 0.55 * k)
            canv.setLineWidth(0.5 + 0.1 * k)
            canv.arc(cx - r, cy - r, cx + r, cy + r, 95, 165)
            a = math.radians(95 + rnd.random() * 165)
            canv.circle(cx + r * math.cos(a), cy + r * math.sin(a), 2.2 + k * 0.6, stroke=0, fill=1)
        size = 1.6 * cm * scale
        _glyph(canv, PLANET_PATHS["sun"], size, cx - size / 2, cy - size / 2, "#B08E4F", 1.4)
    else:  # intro / summary / toc — a constellation
        pts = []
        for _ in range(7 if opener else 5):
            pts.append((cx - rnd.random() * 9 * cm * scale, cy - rnd.random() * 6 * cm * scale))
        canv.setLineWidth(0.5)
        for (x1, y1), (x2, y2) in pairwise(pts):
            canv.line(x1, y1, x2, y2)
        for x, y in pts:
            canv.circle(x, y, 1.6, stroke=0, fill=1)
            canv.circle(x, y, 3.2, stroke=1, fill=0)
        for _ in range(25):
            canv.circle(
                cx - rnd.random() * 10 * cm,
                cy - rnd.random() * 7 * cm,
                0.5 + rnd.random() * 0.6,
                stroke=0,
                fill=1,
            )
    # a quiet scatter of dust in the bottom-left corner on every page
    canv.setFillAlpha(0.35)
    for _ in range(18):
        canv.circle(
            rnd.random() * 5 * cm,
            rnd.random() * 4 * cm,
            0.4 + rnd.random() * 0.6,
            stroke=0,
            fill=1,
        )
    canv.restoreState()
