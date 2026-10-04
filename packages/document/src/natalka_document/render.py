"""Document → PDF with ReportLab.

Layout: dark cover with the gold wheel → table of contents → sections. Every body page sits on warm
paper with a faint motif of the current section (see :mod:`motifs`) and a running side label.
Computed blocks (wheel, positions, aspect grid) are rendered from ``document.facts``; text blocks
are rendered as given.
"""

from __future__ import annotations

import base64
import io
import math
import random
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
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

from . import motifs
from . import styles as st
from .glyphs import ASPECT_PATHS, PLANET_PATHS, SIGN_PATHS
from .labels import ROMAN, SIGN_KEYS, body_name, sign_name, ui
from .schema import (
    AspectGrid,
    Block,
    Brand,
    BulletList,
    DatesTable,
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
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
    "chiron", "north_node", "lilith", "asc", "mc",
)  # fmt: skip
GRID_BODIES = (
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
    "chiron", "north_node", "asc", "mc",
)  # fmt: skip
GRID_COLOURS = {"tense": "#D9553A", "harmonious": "#2B47E0", "neutral": "#9A9EBB"}
INK_HEX = "#232333"
GOLD_HEX = "#B08E4F"
#: The points a reader recognises as themselves. A slow planet meeting another slow planet is a
#: transit too, but it belongs to the prose, not to the page of dates.
PERSONAL_TARGETS = frozenset({"sun", "moon", "mercury", "venus", "mars", "asc", "mc"})
UNNUMBERED = ("chart", "intro")


class _Doc(BaseDocTemplate):
    """Tracks the current page theme and registers headings with the TOC."""

    theme: motifs.PageTheme = motifs.PageTheme("toc")

    def afterFlowable(self, flowable: Flowable) -> None:  # noqa: N802 — ReportLab API
        if isinstance(flowable, _ThemeMarker):
            self.theme = flowable.theme
            return
        key = getattr(flowable, "_toc", None)
        if key:
            level, text = key
            self.notify("TOCEntry", (level, text, self.page))


class _ThemeMarker(Flowable):
    """Zero-size flowable: from here on, pages use ``theme``. Placed *before* page breaks."""

    def __init__(self, theme: motifs.PageTheme) -> None:
        super().__init__()
        self.theme = theme
        self.width = self.height = 0

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        return 0, 0

    def draw(self) -> None:
        return None


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


def _paragraphs(text: str) -> list[str]:
    """Split seller text into paragraphs on blank lines; drop the empty ones."""
    return [p.strip() for p in text.split("\n\n") if p.strip()]


def _image_reader(b64: str) -> ImageReader:
    return ImageReader(io.BytesIO(base64.b64decode(b64)))


def _tight(*extra: tuple[Any, ...]) -> TableStyle:
    return TableStyle(
        [
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            *extra,
        ]
    )


class Renderer:
    def __init__(self, document: Document) -> None:
        self.doc = document
        self.lang = document.meta.lang
        self.width = st.PAGE[0] - 2 * st.MARGIN
        self._positions = {p["body"]: p for p in document.facts["positions"]}
        self._positions_second = {
            p["body"]: p for p in (document.facts_second or {}).get("positions", [])
        }
        brand = document.brand
        self.accent = HexColor(brand.accent) if brand else st.GOLD_BRIGHT
        self.s_eyebrow = (
            ParagraphStyle("EyebrowBrand", parent=st.s_eyebrow, textColor=HexColor(brand.accent))
            if brand
            else st.s_eyebrow
        )

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
            author=self.doc.brand.name if self.doc.brand else "Chronika",
            subject=self.doc.meta.product,
        )
        if self.doc.brand:
            # The producer line still names ReportLab; the creator is the seller, never us.
            doc.creator = self.doc.brand.name
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
        brand = self.doc.brand
        intro = bool(brand and (brand.intro or brand.photo))
        toc_theme = _ThemeMarker(motifs.PageTheme("toc", ui(self.lang, "contents")))
        story: list[Flowable] = [
            _ThemeMarker(motifs.PageTheme("intro", ui(self.lang, "from_author")))
            if intro
            else toc_theme,
            NextPageTemplate("Body"),
            Spacer(1, 1),
            PageBreak(),
        ]
        if brand and intro:
            story += self._from_author(brand)
            story += [toc_theme, PageBreak()]
        story += self._toc()
        number = 0
        label = ""
        for section in self.doc.sections:
            if section.level == 1:
                numbered = section.id not in UNNUMBERED
                if numbered:
                    number += 1
                label = f"{ROMAN[number - 1]} · {section.title}" if numbered else section.title
                theme = motifs.theme_for(section.id)
                story.append(_ThemeMarker(motifs.PageTheme(theme, label, opener=True)))
                story.append(PageBreak())
                story += self._section(section, number if numbered else 0)
                story.append(_ThemeMarker(motifs.PageTheme(theme, label, opener=False)))
            else:
                story += self._section(section, 0)
        if brand and brand.outro:
            story += self._outro(brand)
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

    # ---------- a seller's own pages ----------
    def _signature(self, brand: Brand) -> list[Flowable]:
        if not brand.signature:
            return []
        style = ParagraphStyle(
            "Signature", parent=st.s_body, fontName="PlayfairDisplay-Italic", alignment=TA_RIGHT
        )
        return [Spacer(1, 6), Paragraph(escape(brand.signature), style)]

    def _from_author(self, brand: Brand) -> list[Flowable]:
        """The seller's opening page. Its theme marker sits before the cover's page break."""
        out: list[Flowable] = [
            Paragraph(ui(self.lang, "from_author").upper(), self.s_eyebrow),
            Spacer(1, 10),
        ]
        if brand.photo:
            raw = base64.b64decode(brand.photo)
            iw, ih = ImageReader(io.BytesIO(raw)).getSize()
            width = 4.5 * cm
            photo = Image(io.BytesIO(raw), width=width, height=width * ih / iw)
            photo.hAlign = "LEFT"
            out += [photo, Spacer(1, 12)]
        out += [Paragraph(escape(p), st.s_body) for p in _paragraphs(brand.intro)]
        out += self._signature(brand)
        return out

    def _outro(self, brand: Brand) -> list[Flowable]:
        out: list[Flowable] = [Spacer(1, 18), st.HRule(), Spacer(1, 8)]
        out += [Paragraph(escape(p), st.s_body) for p in _paragraphs(brand.outro)]
        out += self._signature(brand)
        if brand.contacts:
            out.append(Spacer(1, 6))
            out += [Paragraph(escape(c), st.s_caption) for c in brand.contacts]
        return out

    def _toc(self) -> list[Flowable]:
        toc = TableOfContents()
        toc.levelStyles = [st.s_toc_1, st.s_toc_2]
        toc.dotsMinLevel = 0
        return [
            Paragraph(ui(self.lang, "contents").upper(), self.s_eyebrow),
            Paragraph(ui(self.lang, "contents"), st.s_h1),
            st.HRule(),
            Spacer(1, 10),
            toc,
        ]

    def _section(self, s: Section, number: int) -> list[Flowable]:
        out: list[Flowable] = []
        head: list[Flowable] = []
        if s.level == 1:
            eyebrow = s.eyebrow or (
                f"{ui(self.lang, 'section')} {ROMAN[number - 1]}" if number else ""
            )
            if eyebrow:
                head.append(Paragraph(eyebrow.upper(), self.s_eyebrow))
            head += [
                _Heading(s.title, st.s_h1_big if number else st.s_h1, 0, s.toc),
                st.HRule(),
                Spacer(1, 8),
            ]
        else:
            if s.eyebrow:
                head.append(Paragraph(s.eyebrow.upper(), st.s_eyebrow_2))
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
                    out.append(_Heading(b.text, st.s_h3, 1, False))
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
                case DatesTable():
                    out += self._dates_table(b)
                case PageBreakBlock():
                    out.append(PageBreak())
        return out

    # ---------- computed blocks ----------
    def _facts_for(self, chart: int) -> dict[str, Any]:
        """Chart two only exists in a synastry; anything else falls back to the only chart there is."""
        if chart == 2 and self.doc.facts_second:
            return self.doc.facts_second
        return self.doc.facts

    def _wheel(self, b: WheelBlock) -> Flowable:
        size = self.width * (0.64 if b.size == "full" else 0.44)
        d = wheel_drawing(
            self._facts_for(b.chart),
            size_pt=size,
            theme=PDF_LIGHT,
            detail=b.size,
            highlight=b.highlight,
        )
        d.hAlign = "CENTER"
        return d

    def _positions_table(self, b: PositionsTable) -> list[Flowable]:
        lang = self.lang
        positions = (
            self._positions_second if b.chart == 2 and self._positions_second else self._positions
        )
        head = [
            Paragraph(ui(lang, k), st.s_table_head)
            for k in ("planet", "sign", "degree", "house", "retro")
        ]
        rows: list[list[Any]] = [head]
        hl_row: int | None = None
        for body in TABLE_BODIES:
            p = positions.get(body)
            if not p:
                continue
            name = Paragraph(body_name(lang, body), st.s_table)
            if body in PLANET_PATHS:
                glyph = _glyph_drawing(PLANET_PATHS[body], 11, INK_HEX)
                name_cell: Any = Table(
                    [[glyph, name]],
                    colWidths=[16, None],
                    style=_tight(("RIGHTPADDING", (0, 0), (0, 0), 4)),
                )
            else:
                name_cell = name
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
        w = self.width
        t = Table(rows, colWidths=[w * 0.34, w * 0.26, w * 0.18, w * 0.13, w * 0.09], repeatRows=1)
        style: list[tuple[Any, ...]] = [
            ("BACKGROUND", (0, 0), (-1, 0), st.NAVY),
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, st.GOLD),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [st.CREAM, HexColor("#FDFAF3")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
            ("LINEBELOW", (0, -1), (-1, -1), 0.6, st.LINE),
        ]
        if hl_row:
            style.append(("BACKGROUND", (0, hl_row), (-1, hl_row), st.ACCENT_BG))
        t.setStyle(TableStyle(style))
        note = (
            ui(lang, "no_houses")
            if self.doc.unknown_time
            else f"{ui(lang, 'system')}: {ui(lang, 'placidus')}."
        )
        return [
            Spacer(1, 10),
            t,
            Spacer(1, 6),
            Paragraph(f"{ui(lang, 'legend')} {note}", st.s_caption),
            Spacer(1, 8),
        ]

    def _date_row(self, event: dict[str, Any]) -> list[Any]:
        """One line of the dates table: glyphs, then the name, then the date on the left."""
        lang = self.lang
        body = str(event.get("body", ""))
        parts: list[Any] = []
        widths: list[float | None] = []
        if body in PLANET_PATHS:
            parts.append(_glyph_drawing(PLANET_PATHS[body], 11, INK_HEX))
            widths.append(16)
        if event.get("kind") == "ingress":
            sign = str(event.get("sign", ""))
            if sign in SIGN_KEYS:
                parts.append(_glyph_drawing(SIGN_PATHS[SIGN_KEYS.index(sign)], 11, INK_HEX))
                widths.append(16)
            # An arrow rather than a verb: "enters" would need a case ending in every language.
            label = f"{body_name(lang, body)} → {sign_name(lang, sign)}"
            if event.get("retrograde"):
                label += f", {ui(lang, 'retrograde')}"
            parts.append(Paragraph(label, st.s_table))
            widths.append(None)
        else:
            aspect = str(event.get("aspect", ""))
            target = str(event.get("target", ""))
            if aspect in ASPECT_PATHS:
                parts.append(_glyph_drawing(ASPECT_PATHS[aspect], 10, GOLD_HEX))
                widths.append(14)
            if target in PLANET_PATHS:
                parts.append(_glyph_drawing(PLANET_PATHS[target], 11, INK_HEX))
                widths.append(16)
            parts.append(Paragraph(body_name(lang, target), st.s_table))
            widths.append(None)
        what: Any = Table([parts], colWidths=widths, style=_tight()) if parts else ""
        return [Paragraph(_dmy(str(event.get("date", ""))), st.s_table_mono), what]

    def _dates_table(self, b: DatesTable) -> list[Flowable]:
        """The window's exact dates, in order. Glyphs rather than words: the same table then reads
        the same in every language, and a page of "квадрат" repeated forty times reads as noise."""
        events = [
            e
            for e in self.doc.transits
            if (b.include_ingresses if e.get("kind") == "ingress" else True)
            and (
                e.get("kind") == "ingress"
                or not b.personal_only
                or e.get("target") in PERSONAL_TARGETS
            )
        ]
        if not events:
            return []
        lang = self.lang
        rows: list[list[Any]] = [
            [
                Paragraph(ui(lang, "when"), st.s_table_head),
                Paragraph(ui(lang, "what"), st.s_table_head),
            ]
        ]
        rows.extend(self._date_row(event) for event in events)

        w = self.width
        t = Table(rows, colWidths=[w * 0.24, w * 0.76], repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), st.NAVY),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.8, st.GOLD),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [st.CREAM, HexColor("#FDFAF3")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        return [t, Spacer(1, 8), Paragraph(ui(lang, "dates_note"), st.s_caption)]

    def _aspect_grid(self) -> list[Flowable]:
        bodies = [b for b in GRID_BODIES if b in self._positions]
        aspects = {frozenset((a["a"], a["b"])): a for a in self.doc.facts.get("aspects", [])}
        n = len(bodies)
        cell = min(0.78 * cm, self.width / n)

        def head_cell(body: str) -> Any:
            if body in PLANET_PATHS:
                return _glyph_drawing(PLANET_PATHS[body], 12, INK_HEX)
            return Paragraph(f"<font size=7>{body.upper()}</font>", st.s_table_mono_center)

        rows: list[list[Any]] = []
        for i in range(1, n):
            row: list[Any] = [head_cell(bodies[i])]
            for j in range(i):
                a = aspects.get(frozenset((bodies[i], bodies[j])))
                if a and a["type"] in ASPECT_PATHS:
                    row.append(
                        _glyph_drawing(ASPECT_PATHS[a["type"]], 11, GRID_COLOURS[a["nature"]])
                    )
                else:
                    row.append("")
            rows.append(row)
        rows.append(["", *[head_cell(b) for b in bodies[:-1]]])
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
            style.append(("BACKGROUND", (0, r), (0, r), st.CREAM))
            style.append(("BACKGROUND", (1, r), (r + 1, r), HexColor("#FDFAF3")))
        style.append(("BACKGROUND", (1, n - 1), (n - 1, n - 1), st.CREAM))
        style.append(("GRID", (1, n - 1), (n - 1, n - 1), 0.4, st.LINE))
        t.setStyle(TableStyle(style))
        t.hAlign = "LEFT"
        legend = Paragraph(ui(self.lang, "aspect_legend"), st.s_caption)
        return [
            Spacer(1, 6),
            _Heading(ui(self.lang, "aspects"), st.s_h2, 1, False),
            Spacer(1, 6),
            t,
            Spacer(1, 6),
            legend,
            Spacer(1, 8),
        ]

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
        theme = getattr(doc, "theme", motifs.PageTheme("intro"))
        canv.saveState()
        motifs.paper(canv, w, h)
        motifs.motif(canv, w, h, theme.key, theme.opener)
        motifs.side_label(canv, w, h, theme.label)
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
        canv.drawCentredString(w / 2, 1.1 * cm, f"✦  {ui(self.lang, 'footer')}  ✦")
        canv.restoreState()

    def _cover_page(self, canv: Canvas, doc: BaseDocTemplate) -> None:  # noqa: PLR0915 — one drawing routine
        w, h = st.PAGE
        canv.saveState()
        # night sky: deep navy with an indigo glow behind the wheel
        steps = 140
        top, mid = st.SKY, st.SKY_2
        wheel_cy = 0.625
        for i in range(steps):
            f = 1 - (i + 0.5) / steps  # 1 at the top, 0 at the bottom
            glow = math.exp(-((f - wheel_cy) ** 2) / 0.045)
            canv.setFillColor(
                Color(*(a + (b - a) * glow for a, b in zip(top.rgb(), mid.rgb(), strict=True)))
            )
            canv.rect(0, h * (1 - (i + 1) / steps), w, h / steps + 1, stroke=0, fill=1)
        rnd = random.Random(7)
        for _ in range(260):
            x, y = rnd.random() * w, rnd.random() * h
            rr = rnd.choice([0.3, 0.4, 0.5, 0.7, 0.9, 1.2])
            canv.setFillColor(st.STAR_WARM if rnd.random() < 0.15 else st.STAR)
            canv.setFillAlpha(0.25 + rnd.random() * 0.6)
            canv.circle(x, y, rr, stroke=0, fill=1)
        canv.setFillAlpha(1)
        # wheel — the hero of the cover
        size = w * 0.8
        d = wheel_drawing(self.doc.facts, size_pt=size, theme=PDF_DARK, detail="full")
        d.drawOn(canv, (w - size) / 2, h * wheel_cy - size / 2)
        # thin gold rule with a diamond between the sky and the text block
        y_rule = h * 0.325
        canv.setStrokeColor(self.accent)
        canv.setLineWidth(0.6)
        canv.line(w * 0.3, y_rule, w * 0.46, y_rule)
        canv.line(w * 0.54, y_rule, w * 0.7, y_rule)
        canv.setFillColor(self.accent)
        p = canv.beginPath()
        p.moveTo(w / 2, y_rule + 3)
        p.lineTo(w / 2 + 3, y_rule)
        p.lineTo(w / 2, y_rule - 3)
        p.lineTo(w / 2 - 3, y_rule)
        p.close()
        canv.drawPath(p, stroke=0, fill=1)
        # text block
        cx = w / 2
        brand = self.doc.brand
        if brand and brand.logo:
            logo = _image_reader(brand.logo)
            iw, ih = logo.getSize()
            scale = min(1.2 * cm / ih, 5 * cm / iw)
            lw, lh = iw * scale, ih * scale
            # Centred on the wordmark line, so a tall logo stays clear of the gold rule above.
            canv.drawImage(logo, cx - lw / 2, h * 0.298 - lh / 2, lw, lh, mask="auto")
        else:
            canv.setFillColor(self.accent)
            canv.setFont(st.SANS, 8.5)
            name = " ".join(brand.name.upper()) if brand else "C H R O N I K A"
            canv.drawCentredString(cx, h * 0.295, name)
        canv.setFillColor(HexColor("#F4F1E8"))
        canv.setFont("PlayfairDisplay-Medium", 32)
        canv.drawCentredString(cx, h * 0.245, self.doc.cover.title)
        if self.doc.cover.subtitle:
            canv.setFont("PlayfairDisplay-Italic", 14)
            canv.setFillColor(HexColor("#AEB2C8"))
            canv.drawCentredString(cx, h * 0.215, self.doc.cover.subtitle)
        canv.setFillColor(HexColor("#F4F1E8"))
        canv.setFont(st.SERIF, 19)
        canv.drawCentredString(cx, h * 0.170, self.doc.person.name)
        # birth data in three equal columns: label above value, centred in each column
        b = self.doc.birth
        labels = (ui(self.lang, "date"), ui(self.lang, "time"), ui(self.lang, "place"))
        values = (_dmy(b.date), b.time or ui(self.lang, "unknown_time"), b.place)
        y = h * 0.118
        col_w = w / 3
        for i, (lbl, val) in enumerate(zip(labels, values, strict=True)):
            xx = col_w * (i + 0.5)
            canv.setFillColor(self.accent)
            canv.setFont(st.SANS, 7.5)
            canv.drawCentredString(xx, y, "  ".join(lbl.upper()))
            canv.setFillColor(HexColor("#F4F1E8"))
            canv.setFont(st.MONO if i < 2 else st.SANS, 11)
            canv.drawCentredString(xx, y - 17, val)
        canv.setStrokeColor(HexColor("#3A3F5E"))
        canv.setLineWidth(0.5)
        for i in (1, 2):
            canv.line(col_w * i, y - 21, col_w * i, y + 7)
        canv.setFillColor(HexColor("#767B99"))
        canv.setFont(st.SANS, 7.5)
        if brand:
            contact = f"  ·  {brand.contacts[0]}" if brand.contacts else ""
            canv.drawCentredString(cx, 1.3 * cm, f"{self.doc.meta.generated_at:%Y-%m-%d}{contact}")
        else:
            ref = f"{self.doc.meta.order_ref}  ·  " if self.doc.meta.order_ref else ""
            canv.drawCentredString(
                cx, 1.3 * cm, f"{ref}{self.doc.meta.generated_at:%Y-%m-%d}  ·  chronika.me"
            )
        canv.restoreState()


def _dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}"


def render_pdf(document: Document, target: str | Path | io.BytesIO) -> int:
    return Renderer(document).render(target)
