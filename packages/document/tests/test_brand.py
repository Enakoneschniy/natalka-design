import base64
import io
import struct
import zlib
from pathlib import Path

import pypdfium2 as pdfium
import pytest
from natalka_document.render import render_pdf
from natalka_document.schema import Brand, Document
from pydantic import ValidationError

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "natal-uk.json"


def _png(w: int = 8, h: int = 8) -> str:
    """A tiny valid PNG, built by hand so the test needs no image library."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    raw = b"".join(b"\x00" + b"\xe7\xb7\x5c" * w for _ in range(h))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(png).decode()


def _doc(brand: Brand | None) -> Document:
    doc = Document.model_validate_json(EXAMPLE.read_text(encoding="utf-8"))
    doc.brand = brand
    doc.meta.order_ref = "ORDER-REF-123"
    return doc


def _render(doc: Document) -> tuple[list[str], dict[str, str]]:
    buf = io.BytesIO()
    render_pdf(doc, buf)
    pdf = pdfium.PdfDocument(buf.getvalue())
    texts = [pdf[i].get_textpage().get_text_range() for i in range(len(pdf))]
    return texts, pdf.get_metadata_dict()


BRAND = Brand(
    name="Мария Звёздная",
    contacts=["@maria.stars", "+48 600 000 000"],
    accent="#8E7CC3",
    intro="Дорогой друг,\n\nэтот разбор я подготовила специально для вас.",
    outro="Спасибо, что доверились.",
    signature="Мария",
    logo=None,
    photo=_png(),
)


def test_without_a_brand_nothing_changes() -> None:
    texts, meta = _render(_doc(None))
    assert "C H R O N I K A" in texts[0] and "chronika.me" in texts[0]
    assert "ORDER-REF-123" in texts[0]
    assert meta.get("Author") == "Chronika"


def test_a_branded_document_carries_nothing_of_ours() -> None:
    texts, meta = _render(_doc(BRAND))
    whole = "\n".join(texts)
    assert "CHRONIKA" not in whole.upper().replace(" ", "")
    assert "chronika" not in whole.lower()
    assert "ORDER-REF-123" not in whole
    assert all("chronika" not in str(v).lower() for v in meta.values())
    assert meta.get("Author") == "Мария Звёздная"
    assert "М А Р И Я" in texts[0] or "МАРИЯ" in texts[0].replace(" ", "")
    assert "@maria.stars" in texts[0]


def test_a_branded_document_opens_with_the_author_and_closes_with_them() -> None:
    texts, _ = _render(_doc(BRAND))
    assert "ВІД АВТОРА" in texts[1].upper()
    assert "специально для вас" in texts[1]
    assert any("Спасибо, что доверились" in t and "+48 600 000 000" in t for t in texts[-3:])


def test_seller_text_is_shown_literally() -> None:
    hostile = BRAND.model_copy(
        update={"intro": "<b>жирно</b> & <script>x</script> <font size=99>", "logo": _png()}
    )
    texts, _ = _render(_doc(hostile))
    assert "<b>жирно</b> & <script>x</script>" in texts[1]


def test_images_must_be_png_or_jpeg_within_a_megabyte() -> None:
    with pytest.raises(ValidationError):
        Brand(name="X", logo=base64.b64encode(b"GIF89a....").decode())
    with pytest.raises(ValidationError):
        Brand(name="X", photo=base64.b64encode(b"\xff\xd8\xff" + b"0" * 1_048_576).decode())
    with pytest.raises(ValidationError):
        Brand(name="X", accent="purple")
    with pytest.raises(ValidationError):
        Brand(name="X", contacts=["a", "b", "c", "d", "e"])


def _garbage(header: bytes) -> str:
    return base64.b64encode(header + b"\x00not really an image" * 20).decode()


@pytest.mark.parametrize("header", [b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff"])
def test_an_image_with_a_valid_header_but_garbage_is_refused(header: bytes) -> None:
    with pytest.raises(ValidationError):
        Brand(name="X", photo=_garbage(header))


def test_an_image_too_large_to_draw_is_refused() -> None:
    with pytest.raises(ValidationError):
        Brand(name="X", logo=_png(5000, 1))


def test_a_tall_narrow_photo_still_renders() -> None:
    texts, _ = _render(_doc(BRAND.model_copy(update={"photo": _png(2, 40)})))
    assert "ВІД АВТОРА" in texts[1].upper()


def test_seller_line_breaks_survive() -> None:
    brand = BRAND.model_copy(
        update={"intro": "Рядок один\r\nрядок два\r\n\r\nДругий абзац", "photo": None}
    )
    texts, _ = _render(_doc(brand))
    lines = [line.strip() for line in texts[1].splitlines()]
    assert "Рядок один" in lines
    assert "рядок два" in lines
    assert "Другий абзац" in lines


def test_the_contents_start_on_their_own_page() -> None:
    texts, _ = _render(_doc(BRAND))
    assert "ЗМІСТ" not in texts[1]
    assert "ЗМІСТ" in texts[2] and "ВІД АВТОРА" not in texts[2].upper()


def test_an_outro_alone_adds_no_page_from_the_author() -> None:
    brand = BRAND.model_copy(update={"intro": "", "photo": None})
    texts, _ = _render(_doc(brand))
    assert all("ВІД АВТОРА" not in t.upper() for t in texts)
    assert "ЗМІСТ" in texts[1]
    assert any("Спасибо, что доверились" in t for t in texts[-3:])
