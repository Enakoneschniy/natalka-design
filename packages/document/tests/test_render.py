import builtins
import copy
import io
import xml.etree.ElementTree as ET
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium
import pytest
from natalka_document.build import fill_sections, natal_skeleton, skeleton
from natalka_document.labels import BODIES, SIGNS, UI
from natalka_document.render import render_pdf
from natalka_document.schema import (
    Brand,
    BulletList,
    DatedItem,
    DatesTable,
    Document,
    Paragraph,
    Person,
    Quote,
    Subheading,
    Timeline,
)
from natalka_document.wheel import DARK, PDF_DARK, wheel_drawing, wheel_svg
from PIL import Image

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "natal-uk.json"


def _text(pdf_bytes: bytes) -> list[str]:
    pdf = pdfium.PdfDocument(pdf_bytes)
    return [pdf[i].get_textpage().get_text_range() for i in range(len(pdf))]


def test_example_pdf_structure() -> None:
    doc = Document.model_validate_json(EXAMPLE.read_text(encoding="utf-8"))
    buf = io.BytesIO()
    pages = render_pdf(doc, buf)
    texts = _text(buf.getvalue())
    assert pages == len(texts) >= 8
    assert "Натальна карта" in texts[0] and "Оксана" in texts[0]  # cover
    assert "Зміст" in texts[1]  # TOC
    chart_page = next(t for t in texts if "Позиції планет" in t or "Планета" in t)
    assert "24°24′" in chart_page and "Телець" in chart_page  # positions table from facts
    assert any("шар за шаром" in t for t in texts)  # quote box text survives
    assert any("на цьому розбір завершено" in t for t in texts)


def test_unknown_time_document_renders(facts_no_time: dict) -> None:
    doc = natal_skeleton(facts_no_time, person=Person(name="Тест"), place="Київ", lang="uk")
    doc.section("intro").blocks = [Paragraph(text="Текст."), Quote(text="Цитата.")]
    buf = io.BytesIO()
    assert render_pdf(doc, buf) >= 3
    assert "час невідомий" in _text(buf.getvalue())[0]


def test_wheel_drawing_is_exactly_the_requested_size(facts: dict) -> None:
    """svglib rescales SVG units to points; wheel_drawing must undo that, otherwise every caller
    that centres the wheel silently draws it off-centre."""
    for size in (200.0, 476.22):
        d = wheel_drawing(facts, size_pt=size, theme=PDF_DARK)
        assert (round(d.width, 3), round(d.height, 3)) == (round(size, 3), round(size, 3))
        x0, y0, x1, y1 = d.getBounds()
        assert abs(x0) < 0.01 and abs(y0) < 0.01
        assert abs(x1 - size) < 0.01 and abs(y1 - size) < 0.01


def test_wheel_svg_is_valid_xml(facts: dict, facts_no_time: dict) -> None:
    for f, theme in ((facts, DARK), (facts_no_time, DARK)):
        svg = wheel_svg(f, size=400, theme=theme)
        root = ET.fromstring(svg)
        assert root.tag.endswith("svg")
        assert svg.count("<text") >= 12 if f is facts else svg.count("<text") >= 0


#: A tag ReportLab would act on if it ever parsed it: it opens the file and draws it.
IMG = '<img src="probe.png"/>'


@pytest.fixture
def opened(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Runs the test beside a real image the tag names, and records every file opened."""
    Image.new("RGB", (9, 9), "red").save(tmp_path / "probe.png")
    monkeypatch.chdir(tmp_path)
    seen: list[str] = []
    real_open = builtins.open

    def spy(file: Any, *args: Any, **kwargs: Any) -> Any:
        seen.append(str(file))
        return real_open(file, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", spy)
    return seen


def _small(facts: dict[str, Any], **kw: Any) -> Document:
    """A short natal document: the chart page, one chapter and one sub-chapter."""
    doc = natal_skeleton(facts, person=Person(name="Оксана"), place="Київ", lang="uk", **kw)
    texts = {"intro": ("Вступ", "Абзац.", False), "natal.sun": ("Сонце", "Абзац.", False)}
    return fill_sections(doc, texts)


def _dated(facts: dict[str, Any], event: dict[str, Any]) -> Document:
    """A forecast whose page of dates lists ``event`` and nothing else."""
    doc = skeleton(
        facts,
        product="forecast",
        person=Person(name="Оксана"),
        place="Київ",
        lang="uk",
        transits=[event],
    )
    doc = fill_sections(doc, {"forecast.ground": ("Ґрунт", "Абзац.", False)})
    doc.section("dates").blocks = [DatesTable(personal_only=False)]
    return doc


def _with_degree(facts: dict[str, Any]) -> Document:
    hostile = copy.deepcopy(facts)
    hostile["positions"][0]["degree"] = IMG
    return _small(hostile)


def _branded(**fields: Any) -> Callable[[dict[str, Any]], Document]:
    def make(facts: dict[str, Any]) -> Document:
        doc = _small(facts)
        doc.brand = Brand(**{"name": "Марія", **fields})
        return doc

    return make


def _set(path: str, value: Any) -> Callable[[dict[str, Any]], Document]:
    """``section-id.attribute`` or a top-level ``object.attribute`` of a small document."""

    def make(facts: dict[str, Any]) -> Document:
        doc = _small(facts)
        owner, attribute = path.rsplit(".", 1)
        target = doc.section(owner) if owner in {"intro", "natal.sun"} else getattr(doc, owner)
        setattr(target, attribute, value)
        return doc

    return make


def _blocks(*blocks: Any) -> Callable[[dict[str, Any]], Document]:
    def make(facts: dict[str, Any]) -> Document:
        doc = _small(facts)
        doc.section("intro").blocks = [*blocks, *doc.section("intro").blocks]
        return doc

    return make


#: Every string a caller can put into a document, drawn as Paragraph markup or on the canvas.
HOSTILE: dict[str, Callable[[dict[str, Any]], Document]] = {
    "chapter title": _set("intro.title", IMG),
    "sub-chapter title": _set("natal.sun.title", IMG),
    "chapter eyebrow": _set("intro.eyebrow", IMG),
    "sub-chapter eyebrow": _set("natal.sun.eyebrow", IMG),
    "subheading": _blocks(Subheading(text=IMG)),
    "paragraph": _blocks(Paragraph(text=IMG)),
    "quote": _blocks(Quote(text=IMG)),
    "list item": _blocks(BulletList(items=[IMG])),
    "timeline date": _blocks(Timeline(items=[DatedItem(date=IMG, text="Подія.")])),
    "timeline text": _blocks(Timeline(items=[DatedItem(date="9 червня", text=IMG)])),
    "closing note": lambda f: _small(f).model_copy(update={"closing_note": IMG}),
    "disclaimer": lambda f: _small(f).model_copy(update={"disclaimer": IMG}),
    "cover title": _set("cover.title", IMG),
    "cover subtitle": _set("cover.subtitle", IMG),
    "person name": _set("person.name", IMG),
    "birth place": _set("birth.place", IMG),
    "degree from the chart": _with_degree,
    "transit body": lambda f: _dated(
        f, {"date": "2026-06-09", "kind": "ingress", "body": IMG, "sign": "cancer"}
    ),
    "transit target": lambda f: _dated(
        f,
        {
            "date": "2026-06-09",
            "kind": "aspect",
            "body": "jupiter",
            "aspect": "trine",
            "target": IMG,
        },
    ),
    "transit date": lambda f: _dated(
        f, {"date": f"2026-06-{IMG}", "kind": "ingress", "body": "jupiter", "sign": "cancer"}
    ),
    "seller name": _branded(name=IMG),
    "seller contact": _branded(outro="Дякую.", contacts=[IMG]),
    "seller signature": _branded(outro="Дякую.", signature=IMG),
    "seller intro": _branded(intro=IMG),
    "seller outro": _branded(outro=IMG),
}


def _flat(text: str) -> str:
    """Extracted text without line breaks or spacing, in one case: a heading may wrap a tag."""
    return "".join(text.split()).lower()


@pytest.mark.parametrize("field", list(HOSTILE))
def test_a_tag_in_any_field_is_drawn_as_text_and_opens_nothing(
    field: str, facts: dict[str, Any], opened: list[str]
) -> None:
    doc = HOSTILE[field](facts)
    buf = io.BytesIO()
    render_pdf(doc, buf)
    assert not [path for path in opened if path.endswith("probe.png")]
    assert b"/Subtype /Image" not in buf.getvalue()
    assert _flat(IMG) in _flat(" ".join(_text(buf.getvalue())))


def test_every_label_is_plain_text() -> None:
    """Labels go into Paragraph markup unescaped, so none of them may contain markup."""
    labels = [v for table in UI.values() for v in table.values()]
    labels += [v for table in BODIES.values() for v in table.values()]
    labels += [v for names in SIGNS.values() for v in names]
    assert labels
    assert not [label for label in labels if set(label) & set("<>&")]


def test_an_ampersand_survives_a_second_validation(facts: dict[str, Any]) -> None:
    """The jobs Worker sends a skeleton back to be drawn, so it is validated twice."""
    doc = natal_skeleton(facts, person=Person(name="Оксана"), place="Київ", lang="uk")
    doc = fill_sections(doc, {"intro": ("Вступ", "Сонце & Місяць, x <y.", False)})
    again = Document.model_validate(doc.model_dump(mode="json"))
    assert again.section("intro").blocks == doc.section("intro").blocks
    buf = io.BytesIO()
    render_pdf(again, buf)
    text = " ".join(_text(buf.getvalue()))
    assert "Сонце & Місяць, x <y." in text
    assert "&amp;" not in text
