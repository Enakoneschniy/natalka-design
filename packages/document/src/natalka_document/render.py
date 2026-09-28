"""Document → PDF with ReportLab.

Layout: dark cover with the gold wheel → table of contents → sections. Computed blocks (wheel,
positions, aspect grid) are rendered from ``document.facts``; text blocks are rendered as given.
"""

from __future__ import annotations

import io
import math
import random
from pathlib import Path
from typing import Any

from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from svglib.svglib import svg2rlg

from . import styles as st
from .glyphs import ASPECT_PATHS, PLANET_PATHS, SIGN_PATHS
from .labels import ROMAN, body_name, sign_name, ui
from .schema import (
    AspectGrid,
    Block,
    BulletList,
    Document,
    PositionsTable,
    Quote,
    Section,
    Subheading,
    Timeline,
    WheelBlock,
)
from .schema import (
    PageBreak as PageBreakBlock,
)
from .schema import (
    Paragraph as ParagraphBlock,
)
from .wheel import PDF_DARK, PDF_LIGHT, wheel_drawing

TABLE_BODIES = (
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "chiron",
    "north_node",
    "lilith",
    "asc",
    "mc",
)
GRID_BODIES = (
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "chiron",
    "north_node",
    "asc",
    "mc",
)
_SIGN_INDEX = (
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
)


class _Doc(BaseDocTemplate):
    """Registers headings with the TOC as they are laid out."""

    def afterFlowable(self, flowable: Flowable) -> None:  # noqa: N802 — ReportLab API
        key = getattr(flowable, "_toc", None)
        if key:
            level, text = key
            self.notify("TOCEntry", (level, text, self.page))


class _Heading(Paragraph):
    def __init__(self, text: str, style: Any, level: int, register: bool) -> None:
        super().__init__(text, style)
        self._toc = (level, text) if register else None


def _glyph_drawing(path: str, size: float, color: str) -> Drawing:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{size}" height="{size}">'
        f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    )
    d = svg2rlg(io.StringIO(svg))
    assert d is not None
    return d


class Renderer:
    def __init__(self, document: Document) -> None:
        self.doc = document
        self.lang = document.meta.lang
        self.width = st.PAGE[0] - 2 * st.MARGIN
        self._positions = {p["body"]: p for p in document.facts["positions"]}

    # ---------- public ----------
    def render(self, target: str | Path | io.BytesIO) -> int:
        """Write the PDF; return the page count."""
        doc = _Doc(
            str(target) if not isinstance(target, io.BytesIO) else target,
            pagesize=st.PAGE,
            leftMargin=st.MARGIN,
            rightMargin=st.MARGIN,
            topMargin=st.MARGIN,
            bottomMargin=st.MARGIN,
            title=f"{self.doc.cover.title} — {self.doc.person.name}",
            author="Natalka",
            subject=self.doc.meta.product,
        )
        cover_frame = Frame(
            0,
            0,
            st.PAGE[0],
            st.PAGE[1],
            id="cover",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        body_frame = Frame(
            doc.leftMargin, doc.bottomMargin, self.width, st.PAGE[1] - 2 * st.MARGIN, id="body"
        )
        doc.addPageTemplates(
            [
                PageTemplate(id="Cover", frames=[cover_frame], onPage=self._cover_page),
                PageTemplate(id="Body", frames=[body_frame], onPage=self._body_page),
            ]
        )
        doc.multiBuild(self._story())
        return int(doc.page)

    # ---------- story ----------
    def _story(self) -> list[Flowable]:
        story: list[Flowable] = [NextPageTemplate("Body"), Spacer(1, 1), PageBreak()]
        story += self._toc()
        for section in self.doc.sections:
            story += self._section(section)
        if self.doc.closing_note:
            story += [
                Spacer(1, 18),
                st.HRule(),
                Spacer(1, 8),
                Paragraph(self.doc.closing_note, st.s_small_center),
            ]
        if self.doc.disclaimer:
            story += [Spacer(1, 10), Paragraph(self.doc.disclaimer, st.s_caption)]
        return story

    def _toc(self) -> list[Flowable]:
        toc = TableOfContents()
        toc.levelStyles = [st.s_toc_1, st.s_toc_2]
        toc.dotsMinLevel = 0
        return [
            Paragraph(ui(self.lang, "contents").upper(), st.s_eyebrow),
            Paragraph(ui(self.lang, "contents"), st.s_h1),
            st.HRule(),
            Spacer(1, 10),
            toc,
        ]

    def _section(self, s: Section) -> list[Flowable]:
        out: list[Flowable] = []
        if s.page_break_before:
            out.append(PageBreak())
        elif s.level == 1:
            out.append(CondPageBreak(7 * cm))
        head: list[Flowable] = []
        if s.level == 1:
            if s.eyebrow:
                head.append(Paragraph(s.eyebrow.upper(), st.s_eyebrow))
            head += [_Heading(s.title, st.s_h1, 0, s.toc), st.HRule(), Spacer(1, 6)]
        else:
            head.append(_Heading(s.title, st.s_h2, 1, s.toc))
        first = self._blocks(s.blocks[:1])
        out.append(KeepTogether(head + first))
        out += self._blocks(s.blocks[1:])
        return out

    def _blocks(self, blocks: list[Block]) -> list[Flowable]:
        out: list[Flowable] = []
        for b in blocks:
            match b:
                case ParagraphBlock():
                    out.append(Paragraph(b.text, st.s_body))
                case Subheading():
                    out.append(_Heading(b.text, st.s_h2, 1, False))
                case Quote():
                    out += [Spacer(1, 4), st.QuoteBox(b.text), Spacer(1, 8)]
                case BulletList():
                    out += [Paragraph(item, st.s_list, bulletText="•") for item in b.items]
                    out.append(Spacer(1, 4))
                case Timeline():
                    out.append(self._timeline(b))
                case WheelBlock():
                    out.append(self._wheel(b))
                case PositionsTable():
                    out += self._positions_table(b)
                case AspectGrid():
                    out += self._aspect_grid()
                case PageBreakBlock():
                    out.append(PageBreak())
        return out

    # ---------- computed blocks ----------
    def _wheel(self, b: WheelBlock) -> Flowable:
        size = self.width * (0.86 if b.size == "full" else 0.55)
        d = wheel_drawing(
            self.doc.facts, size_pt=size, theme=PDF_LIGHT, detail=b.size, highlight=b.highlight
        )
        d.hAlign = "CENTER"
        return d

    def _positions_table(self, b: PositionsTable) -> list[Flowable]:
        lang = self.lang
        head = [
            Paragraph(ui(lang, k), st.s_table_head)
            for k in ("planet", "sign", "degree", "house", "retro")
        ]
        rows: list[list[Any]] = [head]
        hl_row: int | None = None
        for body in TABLE_BODIES:
            p = self._positions.get(body)
            if not p:
                continue
            glyph = (
                _glyph_drawing(PLANET_PATHS[body], 11, "#232333") if body in PLANET_PATHS else None
            )
            name_cell: Any = (
                Table(
                    [[glyph, Paragraph(body_name(lang, body), st.s_table)]],
                    colWidths=[16, None],
                    style=TableStyle(
                        [
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                            ("TOPPADDING", (0, 0), (-1, -1), 0),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                        ]
                    ),
                )
                if glyph
                else Paragraph(body_name(lang, body), st.s_table)
            )
            house = ROMAN[p["house"] - 1] if p.get("house") else "—"
            retro = "R" if p.get("retrograde") else ""
            if b.highlight == body:
                hl_row = len(rows)
            rows.append(
                [
                    name_cell,
                    Paragraph(sign_name(lang, p["sign"]), st.s_table),
                    Paragraph(p["degree"], st.s_table_mono),
                    Paragraph(house, st.s_table_mono),
                    Paragraph(retro, st.s_table_mono),
                ]
            )
        t = Table(rows, colWidths=[5.0 * cm, 3.6 * cm, 2.6 * cm, 1.8 * cm, 1.2 * cm], repeatRows=1)
        style: list[tuple[Any, ...]] = [
            ("BACKGROUND", (0, 0), (-1, 0), st.NAVY),
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, st.GOLD),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [st.CREAM, HexColor("#FBF6EA")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if hl_row:
            style.append(("BACKGROUND", (0, hl_row), (-1, hl_row), st.ACCENT_BG))
        t.setStyle(TableStyle(style))
        t.hAlign = "LEFT"
        note = (
            ui(lang, "no_houses")
            if self.doc.unknown_time
            else f"{ui(lang, 'system')}: {ui(lang, 'placidus')}."
        )
        return [
            t,
            Spacer(1, 6),
            Paragraph(f"{ui(lang, 'legend')} {note}", st.s_caption),
            Spacer(1, 8),
        ]

    def _aspect_grid(self) -> list[Flowable]:
        bodies = [b for b in GRID_BODIES if b in self._positions]
        aspects = {frozenset((a["a"], a["b"])): a for a in self.doc.facts.get("aspects", [])}
        colours = {"tense": "#D9553A", "harmonious": "#2B47E0", "neutral": "#9A9EBB"}
        cell = 0.62 * cm
        rows: list[list[Any]] = []
        for i in range(1, len(bodies)):
            row: list[Any] = [
                _glyph_drawing(PLANET_PATHS.get(bodies[i], ""), 11, "#232333")
                if bodies[i] in PLANET_PATHS
                else Paragraph(bodies[i].upper(), st.s_table_mono)
            ]
            for j in range(i):
                a = aspects.get(frozenset((bodies[i], bodies[j])))
                if a and a["type"] in ASPECT_PATHS:
                    row.append(_glyph_drawing(ASPECT_PATHS[a["type"]], 10, colours[a["nature"]]))
                else:
                    row.append("")
            rows.append(row)
        rows.append(
            [""]
            + [
                _glyph_drawing(PLANET_PATHS.get(b, ""), 11, "#232333")
                if b in PLANET_PATHS
                else Paragraph(b.upper(), st.s_table_mono)
                for b in bodies[:-1]
            ]
        )
        n = len(bodies)
        t = Table(rows, colWidths=[cell] * n, rowHeights=[cell] * n)
        style: list[tuple[Any, ...]] = [
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]
        for r in range(n - 1):
            style.append(("GRID", (0, r), (r + 1, r), 0.4, st.LINE))
            style.append(("BACKGROUND", (0, r), (0, r), HexColor("#FBF6EA")))
        style.append(("BACKGROUND", (1, n - 1), (n - 1, n - 1), HexColor("#FBF6EA")))
        style.append(("GRID", (1, n - 1), (n - 1, n - 1), 0.4, st.LINE))
        t.setStyle(TableStyle(style))
        t.hAlign = "LEFT"
        return [Paragraph(ui(self.lang, "aspects"), st.s_h2), Spacer(1, 4), t, Spacer(1, 8)]

    def _timeline(self, b: Timeline) -> Flowable:
        rows = [
            [Paragraph(i.date, st.s_timeline_date), Paragraph(i.text, st.s_timeline_text)]
            for i in b.items
        ]
        t = Table(rows, colWidths=[3.4 * cm, self.width - 3.4 * cm])
        t.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.3, st.LINE),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        t.hAlign = "LEFT"
        return t

    # ---------- page furniture ----------
    def _body_page(self, canv: Canvas, doc: BaseDocTemplate) -> None:
        w, h = st.PAGE
        canv.saveState()
        canv.setStrokeColor(st.LINE)
        canv.setLineWidth(0.5)
        canv.line(2 * cm, h - 1.6 * cm, w - 2 * cm, h - 1.6 * cm)
        canv.setFont(st.SANS, 8)
        canv.setFillColor(st.MUTED)
        b = self.doc.birth
        head = f"{self.doc.cover.title}  ·  {self.doc.person.name}  ·  {_dmy(b.date)}  ·  {b.place}"
        canv.drawString(2 * cm, h - 1.3 * cm, head)
        canv.drawRightString(w - 2 * cm, h - 1.3 * cm, f"— {canv.getPageNumber()} —")
        canv.line(2 * cm, 1.6 * cm, w - 2 * cm, 1.6 * cm)
        canv.setFont(st.SANS, 8)
        canv.drawCentredString(w / 2, 1.1 * cm, f"✦  {ui(self.lang, 'footer')}  ✦")
        canv.restoreState()

    def _cover_page(self, canv: Canvas, doc: BaseDocTemplate) -> None:  # noqa: PLR0915 — one drawing routine
        w, h = st.PAGE
        canv.saveState()
        # night sky: vertical gradient from deep navy to a lighter indigo behind the wheel
        steps = 120
        top, mid = st.SKY, st.SKY_2
        for i in range(steps):
            f = i / (steps - 1)
            glow = math.exp(-((f - 0.42) ** 2) / 0.05)  # brightest around the wheel centre
            r = top.red + (mid.red - top.red) * glow
            g = top.green + (mid.green - top.green) * glow
            bl = top.blue + (mid.blue - top.blue) * glow
            canv.setFillColor(Color(r, g, bl))
            canv.rect(0, h * (1 - (i + 1) / steps), w, h / steps + 1, stroke=0, fill=1)
        rnd = random.Random(7)
        for _ in range(220):
            x, y = rnd.random() * w, rnd.random() * h
            rr = rnd.choice([0.3, 0.4, 0.5, 0.7, 0.9, 1.2])
            canv.setFillColor(st.STAR_WARM if rnd.random() < 0.15 else st.STAR)
            canv.setFillAlpha(0.25 + rnd.random() * 0.6)
            canv.circle(x, y, rr, stroke=0, fill=1)
        canv.setFillAlpha(1)
        # wheel
        size = w * 0.62
        d = wheel_drawing(self.doc.facts, size_pt=size, theme=PDF_DARK, detail="full")
        d.drawOn(canv, (w - size) / 2, h * 0.36)
        # text block
        cx = w / 2
        canv.setFillColor(st.GOLD_BRIGHT)
        canv.setFont(st.SANS, 9)
        canv.drawCentredString(cx, h * 0.30, "N A T A L K A")
        canv.setFillColor(HexColor("#F4F1E8"))
        canv.setFont("PlayfairDisplay-Medium", 30)
        canv.drawCentredString(cx, h * 0.255, self.doc.cover.title)
        if self.doc.cover.subtitle:
            canv.setFont("PlayfairDisplay-Italic", 14)
            canv.setFillColor(HexColor("#AEB2C8"))
            canv.drawCentredString(cx, h * 0.225, self.doc.cover.subtitle)
        canv.setFillColor(HexColor("#F4F1E8"))
        canv.setFont(st.SERIF, 18)
        canv.drawCentredString(cx, h * 0.185, self.doc.person.name)
        # birth data in three columns
        b = self.doc.birth
        labels = (ui(self.lang, "date"), ui(self.lang, "time"), ui(self.lang, "place"))
        values = (
            _dmy(b.date),
            (b.time or ui(self.lang, "unknown_time")) + (f"  {b.utc_offset}" if b.time else ""),
            b.place,
        )
        y = h * 0.135
        for xx, lbl, val in zip((w * 0.22, w * 0.5, w * 0.78), labels, values, strict=True):
            canv.setFillColor(st.GOLD_BRIGHT)
            canv.setFont(st.SANS, 8)
            canv.drawCentredString(xx, y, "  ".join(lbl.upper()))
            canv.setFillColor(HexColor("#F4F1E8"))
            canv.setFont(st.MONO if lbl != labels[2] else st.SANS, 11)
            canv.drawCentredString(xx, y - 16, val)
        canv.setStrokeColor(HexColor("#3A3F5E"))
        canv.setLineWidth(0.5)
        for sx in (w * 0.36, w * 0.64):
            canv.line(sx, y - 20, sx, y + 6)
        canv.setFillColor(HexColor("#767B99"))
        canv.setFont(st.SANS, 7.5)
        ref = f"{self.doc.meta.order_ref}  ·  " if self.doc.meta.order_ref else ""
        canv.drawCentredString(
            cx, 1.3 * cm, f"{ref}{self.doc.meta.generated_at:%Y-%m-%d}  ·  natalka.app"
        )
        canv.restoreState()


def _dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}"


def render_pdf(document: Document, target: str | Path | io.BytesIO) -> int:
    return Renderer(document).render(target)


_ = (SIGN_PATHS, _SIGN_INDEX)  # re-exported for callers that build custom blocks
