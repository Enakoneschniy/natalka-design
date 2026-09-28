"""Fonts, palette, paragraph styles and decorative flowables.

Ported from ``reference/astrolog/astro_build_pdf.py``: warm cream/navy/gold inner pages, gold-diamond
rule, tinted quote box. Typefaces swapped to Playfair Display / Golos Text / JetBrains Mono.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, Paragraph
from svglib.fonts import register_font as svg_register

FONT_DIR = Path(__file__).with_name("fonts")
PAGE = A4
MARGIN = 2.2 * cm

# ---------- palette (inner pages) ----------
NAVY = HexColor("#1B2545")
INK = HexColor("#232333")
GOLD = HexColor("#B08E4F")
GOLD_BRIGHT = HexColor("#E7B75C")
ROSE = HexColor("#8C5F6B")
MUTED = HexColor("#6B6B7C")
CREAM = HexColor("#F7F1E6")
LINE = HexColor("#D9CDB4")
ACCENT_BG = HexColor("#F1EADD")
WHITE = HexColor("#FFFFFF")
# ---------- palette (cover) ----------
SKY = HexColor("#06091A")
SKY_2 = HexColor("#182252")
STAR = HexColor("#DCE4FF")
STAR_WARM = HexColor("#F5D9A6")

SERIF = "PlayfairDisplay"
SANS = "GolosText"
MONO = "JetBrainsMono"


@lru_cache(maxsize=1)
def register_fonts() -> None:
    """Register the vendored fonts with ReportLab and svglib (idempotent)."""
    files = {
        "PlayfairDisplay": "PlayfairDisplay-Regular.ttf",
        "PlayfairDisplay-Medium": "PlayfairDisplay-Medium.ttf",
        "PlayfairDisplay-Bold": "PlayfairDisplay-Bold.ttf",
        "PlayfairDisplay-Italic": "PlayfairDisplay-Italic.ttf",
        "GolosText": "GolosText-Regular.ttf",
        "GolosText-Medium": "GolosText-Medium.ttf",
        "GolosText-Bold": "GolosText-Bold.ttf",
        "JetBrainsMono": "JetBrainsMono-Regular.ttf",
        "JetBrainsMono-Medium": "JetBrainsMono-Medium.ttf",
    }
    for name, file in files.items():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    pdfmetrics.registerFontFamily(
        SERIF,
        normal=SERIF,
        bold="PlayfairDisplay-Bold",
        italic="PlayfairDisplay-Italic",
        boldItalic="PlayfairDisplay-Bold",
    )
    pdfmetrics.registerFontFamily(
        SANS, normal=SANS, bold="GolosText-Bold", italic=SANS, boldItalic="GolosText-Bold"
    )
    pdfmetrics.registerFontFamily(
        MONO,
        normal=MONO,
        bold="JetBrainsMono-Medium",
        italic=MONO,
        boldItalic="JetBrainsMono-Medium",
    )
    # svglib resolves font-family names through its own registry
    svg_register(
        "JetBrains Mono",
        str(FONT_DIR / "JetBrainsMono-Regular.ttf"),
        weight="normal",
        style="normal",
        rlgFontName=MONO,
    )
    svg_register(
        "JetBrains Mono",
        str(FONT_DIR / "JetBrainsMono-Medium.ttf"),
        weight="500",
        style="normal",
        rlgFontName="JetBrainsMono-Medium",
    )


def _style(name: str, **kw: object) -> ParagraphStyle:
    return ParagraphStyle(name, **kw)


register_fonts()

s_eyebrow = _style(
    "Eyebrow",
    fontName=SANS,
    fontSize=8.5,
    textColor=GOLD,
    leading=11,
    spaceAfter=2,
    alignment=TA_LEFT,
)
s_h1 = _style(
    "H1",
    fontName="PlayfairDisplay-Medium",
    fontSize=20,
    textColor=NAVY,
    leading=25,
    spaceBefore=10,
    spaceAfter=4,
)
s_h2 = _style(
    "H2",
    fontName="PlayfairDisplay-Medium",
    fontSize=14,
    textColor=ROSE,
    leading=18,
    spaceBefore=12,
    spaceAfter=3,
)
s_body = _style(
    "Body",
    fontName=SANS,
    fontSize=10.5,
    textColor=INK,
    leading=15.5,
    alignment=TA_JUSTIFY,
    spaceAfter=6,
)
s_quote = _style(
    "Quote",
    fontName="PlayfairDisplay-Italic",
    fontSize=11.5,
    textColor=NAVY,
    leading=17,
    leftIndent=0,
    rightIndent=6,
)
s_caption = _style("Caption", fontName=SANS, fontSize=8.5, textColor=MUTED, leading=11)
s_caption_center = _style(
    "CaptionCenter", fontName=SANS, fontSize=8.5, textColor=MUTED, leading=11, alignment=TA_CENTER
)
s_small_center = _style(
    "SmallCenter", fontName=SANS, fontSize=8.5, textColor=MUTED, leading=11, alignment=TA_CENTER
)
s_toc_1 = _style(
    "Toc1",
    fontName="PlayfairDisplay-Medium",
    fontSize=10.5,
    textColor=NAVY,
    leading=14,
    spaceBefore=5,
)
s_toc_2 = _style("Toc2", fontName=SANS, fontSize=9.5, textColor=INK, leading=12.5, leftIndent=14)
s_list = _style(
    "List",
    fontName=SANS,
    fontSize=10.5,
    textColor=INK,
    leading=15.5,
    leftIndent=14,
    bulletIndent=2,
    spaceAfter=3,
)
s_timeline_date = _style(
    "TlDate", fontName="JetBrainsMono-Medium", fontSize=9, textColor=GOLD, leading=13
)
s_timeline_text = _style("TlText", fontName=SANS, fontSize=10, textColor=INK, leading=14)
s_table = _style("Table", fontName=SANS, fontSize=9.5, textColor=INK, leading=12)
s_table_mono = _style("TableMono", fontName=MONO, fontSize=9, textColor=INK, leading=12)
s_table_mono_center = _style(
    "TableMonoCenter", fontName=MONO, fontSize=9, textColor=INK, leading=12, alignment=TA_CENTER
)
s_table_head = _style(
    "TableHead", fontName="GolosText-Medium", fontSize=8.5, textColor=CREAM, leading=11
)

s_h1_big = _style(
    "H1Big",
    fontName="PlayfairDisplay-Medium",
    fontSize=26,
    textColor=NAVY,
    leading=32,
    spaceBefore=18,
    spaceAfter=6,
)
s_h3 = _style(
    "H3",
    fontName="GolosText-Medium",
    fontSize=11.5,
    textColor=NAVY,
    leading=15,
    spaceBefore=8,
    spaceAfter=3,
)
s_eyebrow_2 = _style(
    "Eyebrow2", fontName=SANS, fontSize=8, textColor=GOLD, leading=10, spaceBefore=10
)
s_caption_center = _style(
    "CaptionCenter", fontName=SANS, fontSize=8.5, textColor=MUTED, leading=11, alignment=TA_CENTER
)
s_table_mono_center = _style(
    "TableMonoCenter", fontName=MONO, fontSize=9, textColor=INK, leading=12, alignment=TA_CENTER
)


class HRule(Flowable):
    """Thin rule with a gold diamond in the middle."""

    def __init__(
        self, width: float | None = None, color: HexColor = LINE, thickness: float = 0.5
    ) -> None:
        super().__init__()
        self._width = width
        self.color = color
        self.thickness = thickness
        self.height = 12

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        self.width = self._width or avail_width
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        y = self.height / 2
        cx = self.width / 2
        gap, size = 8, 3
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        c.line(0, y, cx - gap, y)
        c.line(cx + gap, y, self.width, y)
        c.setFillColor(GOLD)
        p = c.beginPath()
        p.moveTo(cx, y + size)
        p.lineTo(cx + size, y)
        p.lineTo(cx, y - size)
        p.lineTo(cx - size, y)
        p.close()
        c.drawPath(p, stroke=0, fill=1)


class QuoteBox(Flowable):
    """Tinted panel with a gold bar on the left — the reading's "one line to remember"."""

    def __init__(self, text: str, width: float | None = None) -> None:
        super().__init__()
        self.text = text
        self._width = width
        self._para: Paragraph | None = None
        self._h = 0.0

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        self.width = self._width or avail_width
        self._para = Paragraph(self.text, s_quote)
        _, h = self._para.wrap(self.width - 28, avail_height)
        self._h = h + 20
        return self.width, self._h

    def draw(self) -> None:
        c = self.canv
        c.setFillColor(ACCENT_BG)
        c.rect(0, 0, self.width, self._h, stroke=0, fill=1)
        c.setFillColor(GOLD)
        c.rect(0, 0, 3, self._h, stroke=0, fill=1)
        assert self._para is not None
        self._para.drawOn(c, 14, 10)
