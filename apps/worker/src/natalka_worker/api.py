"""Internal HTTP API used by the web app: free preview calculation and the wheel SVG.

Not exposed publicly; the web app proxies it. No database access here.
"""

from __future__ import annotations

import datetime as dt
import io
from dataclasses import asdict
from datetime import UTC
from typing import Annotated, Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from natalka_document.build import fill_sections, natal_skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Document, Person
from natalka_document.wheel import DARK, LIGHT, wheel_svg
from natalka_engine import (
    NatalInput,
    chart_to_dict,
    compute_natal,
    ephemeris,
    events_to_list,
    transit_events,
)
from natalka_engine.geo import zone_for
from natalka_engine.timeutil import UnknownTimeZoneError
from natalka_texts import ModelUnavailableError, OpenRouterProvider, fact_sheet, specs, title
from natalka_texts.generate import MAX_TOKENS
from natalka_texts.prompts import repair_prompt, section_prompt, system_prompt
from natalka_texts.validate import check
from pydantic import BaseModel, Field, field_validator

from .cities import CityDatabaseMissingError, search_cities

app = FastAPI(title="Natalka internal API", version="0.1.0", docs_url=None, redoc_url=None)


class BirthPayload(BaseModel):
    # field names shadow the datetime classes inside the class body, hence the module alias
    date: dt.date
    time: dt.time | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    zone: str | None = Field(
        default=None, description="IANA zone; derived from coordinates if omitted"
    )

    @field_validator("date")
    @classmethod
    def _range(cls, v: dt.date) -> dt.date:
        if not (dt.date(1800, 1, 1) <= v <= dt.date(2099, 12, 31)):
            raise ValueError("date must be between 1800 and 2099")
        return v

    def to_input(self) -> NatalInput:
        zone = self.zone or zone_for(self.latitude, self.longitude)
        return NatalInput(self.date, self.time, zone, self.latitude, self.longitude)


class CalcRequest(BirthPayload):
    transit_years: float = Field(default=0, ge=0, le=5)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "ephemeris": ephemeris.version()}


@app.post("/v1/calc")
def calc(req: CalcRequest) -> dict[str, Any]:
    try:
        chart = compute_natal(req.to_input())
    except UnknownTimeZoneError as exc:
        raise HTTPException(422, f"unknown time zone: {exc}") from exc
    payload = chart_to_dict(chart)
    if req.transit_years:
        start = dt.datetime.now(UTC)
        end = start.replace(year=start.year + int(req.transit_years))
        payload["transits"] = events_to_list(transit_events(chart, start, end))
    return payload


@app.get("/v1/wheel.svg")
def wheel(  # noqa: PLR0917 — query parameters
    date_: Annotated[dt.date, Query(alias="date")],
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
    time_: Annotated[dt.time | None, Query(alias="time")] = None,
    zone: str | None = None,
    theme: Literal["dark", "light"] = "dark",
    size: Annotated[int, Query(ge=120, le=1200)] = 640,
    detail: Literal["full", "compact"] = "full",
    highlight: str | None = None,
) -> Response:
    payload = BirthPayload(
        date=date_, time=time_, latitude=latitude, longitude=longitude, zone=zone
    )
    chart = compute_natal(payload.to_input())
    svg = wheel_svg(
        chart_to_dict(chart),
        size=size,
        detail=detail,
        theme=DARK if theme == "dark" else LIGHT,
        highlight=highlight,
    )
    return Response(
        svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"}
    )


class SectionRequest(BaseModel):
    """One section of a reading.

    The jobs worker drives the document section by section rather than asking for it in one
    request: a full reading takes minutes, and a per-section call keeps every step inside normal
    HTTP timeouts, lets a single failed section be retried on its own and gives the waiting page
    something honest to show ("12 of 27 written").
    """

    facts: dict[str, Any]
    transits: list[dict[str, Any]] = Field(default_factory=list)
    section_id: str
    product: Literal["natal", "forecast", "synastry", "child", "bundle"] = "natal"
    lang: str = Field(default="uk", pattern=r"^[a-z]{2}$")
    name: str = Field(min_length=1, max_length=80)
    gender: Literal["f", "m", "n"] = "n"
    #: Titles and openings of the sections already written, so the document does not repeat itself.
    written_so_far: list[str] = Field(default_factory=list)


@app.get("/v1/sections")
def sections(
    product: Literal["natal", "forecast", "synastry", "child", "bundle"] = "natal",
    lang: str = "uk",
    unknown_time: bool = False,
) -> dict[str, Any]:
    """The plan for a document: which sections to write, in order."""
    chosen = specs(product, unknown_time=unknown_time)
    return {
        "product": product,
        "sections": [{"id": s.id, "title": title(s, lang), "quote": s.quote} for s in chosen],
    }


@app.post("/v1/section")
def section(req: SectionRequest) -> dict[str, Any]:
    spec = next((s for s in specs(req.product, unknown_time=False) if s.id == req.section_id), None)
    if spec is None:
        raise HTTPException(404, f"unknown section: {req.section_id}")

    provider = OpenRouterProvider()
    system = system_prompt(req.lang, req.gender)
    # The transit list is the longest part of the sheet; only the forecast sections pay for it.
    user = section_prompt(
        spec,
        name=req.name,
        sheet=fact_sheet(req.facts, req.transits if spec.needs_transits else None),
        written_so_far=req.written_so_far,
    )
    try:
        completion = provider.complete(system, user, max_tokens=MAX_TOKENS)
        report = check(
            completion.text,
            lang=req.lang,
            min_paragraphs=spec.paragraphs[0],
            max_paragraphs=spec.paragraphs[1],
        )
        attempts = 1
        if not report.ok:
            attempts = 2
            completion2 = provider.complete(
                system,
                f"{user}\n\n{repair_prompt(list(report.problems))}",
                max_tokens=MAX_TOKENS,
            )
            report2 = check(
                completion2.text,
                lang=req.lang,
                min_paragraphs=spec.paragraphs[0],
                max_paragraphs=spec.paragraphs[1],
            )
            # Keep the receipt of both attempts: the caller pays for them either way.
            return {
                "id": spec.id,
                "title": title(spec, req.lang),
                "quote": spec.quote,
                "text": completion2.text,
                "problems": list(report2.problems),
                "attempts": attempts,
                "tokens_in": completion.tokens_in + completion2.tokens_in,
                "tokens_out": completion.tokens_out + completion2.tokens_out,
                "cost_micros": completion.cost_micros + completion2.cost_micros,
                "model": completion2.model,
            }
    except ModelUnavailableError as exc:
        raise HTTPException(503, f"model unavailable: {exc}") from exc

    return {
        "id": spec.id,
        "title": title(spec, req.lang),
        "quote": spec.quote,
        "text": completion.text,
        "problems": [],
        "attempts": attempts,
        "tokens_in": completion.tokens_in,
        "tokens_out": completion.tokens_out,
        "cost_micros": completion.cost_micros,
        "model": completion.model,
    }


class WrittenSection(BaseModel):
    id: str
    title: str
    text: str
    quote: bool = False


class SkeletonRequest(BaseModel):
    """Assemble a document: the fixed structure plus the sections that were written."""

    facts: dict[str, Any]
    transits: list[dict[str, Any]] = Field(default_factory=list)
    sections: list[WrittenSection] = Field(default_factory=list)
    product: Literal["natal", "forecast", "synastry", "child", "bundle"] = "natal"
    lang: str = Field(default="uk", pattern=r"^[a-z]{2}$")
    name: str = Field(min_length=1, max_length=80)
    gender: Literal["f", "m", "n"] = "n"
    place: str = ""
    order_ref: str | None = None


@app.post("/v1/skeleton")
def skeleton(req: SkeletonRequest) -> dict[str, Any]:
    if req.product != "natal":
        raise HTTPException(400, f"no skeleton for product: {req.product}")
    document = natal_skeleton(
        req.facts,
        person=Person(name=req.name, gender=req.gender),
        place=req.place,
        lang=req.lang,
        order_ref=req.order_ref,
        transits=req.transits,
        engine_version=ephemeris.version(),
    )
    filled = fill_sections(document, {s.id: (s.title, s.text, s.quote) for s in req.sections})
    return filled.model_dump(mode="json")


@app.post("/v1/document")
def document(doc: Document) -> Response:
    """Render a finished document to PDF.

    The caller (the jobs worker) owns the text; this endpoint only knows how to draw. Kept
    synchronous: a 30-page document takes a couple of seconds and the queue already retries.
    """
    buffer = io.BytesIO()
    pages = render_pdf(doc, buffer)
    return Response(
        buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "content-disposition": 'attachment; filename="natalka.pdf"',
            # The caller records the page count with the document; counting it again would mean
            # parsing the PDF it just received.
            "x-pages": str(pages),
        },
    )


@app.get("/v1/cities")
def cities(
    q: Annotated[str, Query(min_length=2, max_length=80)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> dict[str, Any]:
    try:
        found = search_cities(q, limit)
    except CityDatabaseMissingError as exc:
        raise HTTPException(503, f"city database missing: {exc}") from exc
    return {"cities": [asdict(city) for city in found]}


@app.get("/v1/zone")
def zone(
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
) -> dict[str, str]:
    try:
        return {"zone": zone_for(latitude, longitude)}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
