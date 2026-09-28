import io
import xml.etree.ElementTree as ET
from pathlib import Path

import pypdfium2 as pdfium
from natalka_document.build import natal_skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Document, Paragraph, Person, Quote
from natalka_document.wheel import DARK, wheel_svg

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


def test_wheel_svg_is_valid_xml(facts: dict, facts_no_time: dict) -> None:
    for f, theme in ((facts, DARK), (facts_no_time, DARK)):
        svg = wheel_svg(f, size=400, theme=theme)
        root = ET.fromstring(svg)
        assert root.tag.endswith("svg")
        assert svg.count("<text") >= 12 if f is facts else svg.count("<text") >= 0
