"""The document model: everything a PDF (or a web page) is rendered from.

Texts are **data**. A document is a tree of sections and blocks; computed blocks (wheel, positions
table, aspect grid) carry no data of their own — they are rendered from ``Document.facts``, the
engine JSON, so the numbers in the PDF can never drift from the calculation.
"""

from __future__ import annotations

import base64
import io
import re
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, field_validator

Product = Literal["natal", "forecast", "synastry", "child", "bundle"]
Gender = Literal["f", "m", "n"]

_ALLOWED_TAGS = re.compile(r"</?(b|i|br/?)>", re.IGNORECASE)
_ANY_TAG = re.compile(r"<[^>]+>")


def clean_markup(text: str) -> str:
    """Keep only ``<b>``, ``<i>``, ``<br/>``; escape everything else so ReportLab never sees stray tags."""
    keep: list[str] = []

    def stash(m: re.Match[str]) -> str:
        keep.append(m.group(0).lower().replace("<br>", "<br/>"))
        return f"\x00{len(keep) - 1}\x00"

    tmp = _ALLOWED_TAGS.sub(stash, text)
    tmp = _ANY_TAG.sub(lambda m: m.group(0).replace("<", "&lt;").replace(">", "&gt;"), tmp)
    tmp = tmp.replace("&", "&amp;").replace("&amp;lt;", "&lt;").replace("&amp;gt;", "&gt;")
    return re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], tmp)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Person(_Strict):
    name: str = Field(min_length=1, max_length=80)
    gender: Gender = "n"


class Birth(_Strict):
    date: str  # ISO date
    time: str | None = None  # HH:MM local, None = unknown
    unknown_time: bool = False
    place: str
    zone: str
    utc_offset: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class Meta(_Strict):
    product: Product
    lang: str = Field(pattern=r"^[a-z]{2}$")
    order_ref: str | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    schema_version: int = 1
    engine_version: str = ""


class Cover(_Strict):
    title: str = Field(max_length=200)
    subtitle: str = ""
    tagline: str = ""


class Paragraph(_Strict):
    type: Literal["paragraph"] = "paragraph"
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_markup(v.strip())


class Subheading(_Strict):
    type: Literal["subheading"] = "subheading"
    text: str = Field(min_length=1)


class Quote(_Strict):
    type: Literal["quote"] = "quote"
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_markup(v.strip())


class BulletList(_Strict):
    type: Literal["list"] = "list"
    items: list[str] = Field(min_length=1)

    @field_validator("items")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        return [clean_markup(i.strip()) for i in v]


class DatedItem(_Strict):
    date: str  # human-readable, already localised (e.g. "26 квітня 2026")
    text: str

    @field_validator("text")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_markup(v.strip())


class Timeline(_Strict):
    type: Literal["timeline"] = "timeline"
    items: list[DatedItem] = Field(min_length=1)


class WheelBlock(_Strict):
    type: Literal["wheel"] = "wheel"
    size: Literal["full", "compact"] = "full"
    highlight: str | None = None  # body id to emphasise
    #: Which chart to draw. Only a synastry has a second one.
    chart: Literal[1, 2] = 1


class PositionsTable(_Strict):
    type: Literal["positions"] = "positions"
    highlight: str | None = None
    chart: Literal[1, 2] = 1


class AspectGrid(_Strict):
    type: Literal["aspect_grid"] = "aspect_grid"


class DatesTable(_Strict):
    """Every exact transit of the window on one page, in date order — the page a reader comes
    back to. Drawn from `Document.transits`, so it costs nothing to generate."""

    type: Literal["dates"] = "dates"
    #: Ingresses are the quieter half of the list; a shorter table reads better.
    include_ingresses: bool = True
    #: Keep only what touches a personal point or an angle. A transit of Saturn to natal Neptune
    #: is real but it is not what a reader came to the page for.
    personal_only: bool = True


class PageBreak(_Strict):
    type: Literal["page_break"] = "page_break"


Block = Annotated[
    Paragraph
    | Subheading
    | Quote
    | BulletList
    | Timeline
    | WheelBlock
    | PositionsTable
    | AspectGrid
    | DatesTable
    | PageBreak,
    Field(discriminator="type"),
]


class Section(_Strict):
    id: str = Field(pattern=r"^[a-z0-9_.-]+$")
    title: str = Field(max_length=200)
    eyebrow: str = ""  # small label above the title, e.g. "01 — загальне враження"
    level: Literal[1, 2] = 1
    toc: bool = True
    page_break_before: bool = False
    blocks: list[Block] = Field(default_factory=list)


#: Bounds a brand image must fit so the renderer can always draw it.
MAX_IMAGE_SIDE = 4000
MAX_IMAGE_PIXELS = 16_000_000


def _check_drawable(raw: bytes) -> None:
    """Refuse anything Pillow cannot read as a sane PNG or JPEG: a header alone is not enough."""
    message = "image must be a valid PNG or JPEG up to 4000 px per side"
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.verify()
        with Image.open(io.BytesIO(raw)) as img:
            w, h = img.size
            # Phones write multi-picture JPEGs (MPF, HDR gain maps), which Pillow names "MPO".
            if img.format not in {"PNG", "JPEG", "MPO"}:
                raise ValueError(message)
            # Bounds before decoding, so a decompression bomb is refused without being inflated.
            if max(w, h) > MAX_IMAGE_SIDE or w * h > MAX_IMAGE_PIXELS:
                raise ValueError(message)
            # verify() does not decode JPEG data; only a full load notices a truncated file.
            img.load()
    except Exception as exc:  # Pillow raises many types for broken or hostile input
        raise ValueError(message) from exc


class Brand(_Strict):
    """A seller's brand. When present, the document is the seller's: nothing of ours is drawn."""

    name: str = Field(min_length=1, max_length=60)
    contacts: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list, max_length=4
    )
    accent: str = Field(default="#E7B75C", pattern=r"^#[0-9A-Fa-f]{6}$")
    intro: str = Field(default="", max_length=3000)
    outro: str = Field(default="", max_length=3000)
    signature: str = Field(default="", max_length=80)
    #: PNG or JPEG, base64, at most 1 MB decoded.
    logo: str | None = None
    photo: str | None = None

    @field_validator("logo", "photo")
    @classmethod
    def _image(cls, value: str | None) -> str | None:
        if value is None:
            return None
        raw = base64.b64decode(value, validate=True)
        if len(raw) > 1_048_576:
            raise ValueError("image larger than 1 MB")
        if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
            raise ValueError("image must be PNG or JPEG")
        _check_drawable(raw)
        return value


class Document(_Strict):
    meta: Meta
    person: Person
    birth: Birth
    cover: Cover
    facts: dict[str, Any]  # chart JSON as the ephemeris service returns it
    #: The partner's chart in a synastry; absent everywhere else.
    facts_second: dict[str, Any] | None = None
    transits: list[dict[str, Any]] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    closing_note: str = ""  # e.g. "✦ на цьому розбір завершено ✦"
    disclaimer: str = ""
    #: A seller's brand (Chronika Pro). Absent for our own readings.
    brand: Brand | None = None

    @property
    def unknown_time(self) -> bool:
        return self.birth.unknown_time

    def section(self, section_id: str) -> Section:
        for s in self.sections:
            if s.id == section_id:
                return s
        raise KeyError(section_id)


def json_schema() -> dict[str, Any]:
    return Document.model_json_schema()
