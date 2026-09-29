"""The document model: everything a PDF (or a web page) is rendered from.

Texts are **data**. A document is a tree of sections and blocks; computed blocks (wheel, positions
table, aspect grid) carry no data of their own — they are rendered from ``Document.facts``, the
engine JSON, so the numbers in the PDF can never drift from the calculation.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

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
    latitude: float
    longitude: float


class Meta(_Strict):
    product: Product
    lang: str = Field(pattern=r"^[a-z]{2}$")
    order_ref: str | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    schema_version: int = 1
    engine_version: str = ""


class Cover(_Strict):
    title: str
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
    title: str
    eyebrow: str = ""  # small label above the title, e.g. "01 — загальне враження"
    level: Literal[1, 2] = 1
    toc: bool = True
    page_break_before: bool = False
    blocks: list[Block] = Field(default_factory=list)


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
