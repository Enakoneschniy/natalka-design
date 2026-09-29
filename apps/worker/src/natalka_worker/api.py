"""Internal HTTP API used by the web app: free preview calculation and the wheel SVG.

Not exposed publicly; the web app proxies it. No database access here.
"""

from __future__ import annotations

import datetime as dt
import io
import os
import re
from datetime import UTC
from typing import Annotated, Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from natalka_document.build import SECTIONS, fill_sections
from natalka_document.build import skeleton as build_skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Document, Person
from natalka_document.wheel import DARK, LIGHT, wheel_svg
from natalka_engine import (
    NatalInput,
    chart_to_dict,
    compute_natal,
    ephemeris,
    events_to_list,
    synastry_to_dict,
    transit_events,
)
from natalka_engine.bodies import (
    OUTER_PLANETS,
    PERSONAL_PLANETS,
    PLANETS,
    Body,
    Sign,
    format_degree,
)
from natalka_engine.chart import house_of
from natalka_engine.geo import zone_for
from natalka_engine.timeutil import UnknownTimeZoneError
from natalka_engine.transits import events_for, positions_at
from natalka_texts import (
    PREVIEW,
    PREVIEW_NO_TIME,
    PREVIEW_SYNASTRY,
    PREVIEW_TITLES,
    PREVIEW_TITLES_NO_TIME,
    PREVIEW_TITLES_SYNASTRY,
    ModelUnavailableError,
    OpenRouterProvider,
    fact_sheet,
    specs,
    synastry_sheet,
    title,
)
from natalka_texts.generate import MAX_TOKENS, write_horoscope
from natalka_texts.prompts import repair_prompt, section_prompt, system_prompt
from natalka_texts.validate import check
from pydantic import BaseModel, Field, field_validator

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
    return {
        "status": "ok",
        "ephemeris": ephemeris.version(),
        "build": os.environ.get("NATALKA_BUILD", "dev"),
    }


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


class SynastryRequest(BaseModel):
    first: BirthPayload
    second: BirthPayload


@app.post("/v1/synastry")
def synastry(req: SynastryRequest) -> dict[str, Any]:
    try:
        a = compute_natal(req.first.to_input())
        b = compute_natal(req.second.to_input())
    except UnknownTimeZoneError as exc:
        raise HTTPException(422, f"unknown time zone: {exc}") from exc
    return synastry_to_dict(a, b)


class PreviewRequest(BaseModel):
    """The free passages shown before payment."""

    facts: dict[str, Any]
    lang: str = Field(default="uk", pattern=r"^[a-z]{2}$")
    gender: Literal["f", "m", "n"] = "n"
    product: Literal["natal", "forecast", "synastry", "child", "bundle"] = "natal"
    #: Only a synastry has two people; the sheet is written around their names.
    first_name: str = ""
    second_name: str = ""
    #: Deliberately absent: the name. The preview is cached by the birth data alone, and leaving
    #: the name out of the prompt is what makes two people born at the same minute share a cache
    #: entry instead of paying for the same three paragraphs twice.


@app.post("/v1/preview")
def preview(req: PreviewRequest) -> dict[str, Any]:
    """Three short passages in a single call.

    One call, not three: the fact sheet is most of the input, so three separate requests would
    triple both the bill and — more to the point — the time the visitor spends looking at a
    spinner. The whole thing has to come back in the time it takes to read the chart wheel.
    """
    if req.product == "synastry":
        # A synastry payload has two charts and no `birth` of its own.
        spec = PREVIEW_SYNASTRY
        titles = PREVIEW_TITLES_SYNASTRY
        sheet = synastry_sheet(
            req.facts, first_name=req.first_name or "A", second_name=req.second_name or "B"
        )
    else:
        unknown_time = bool(req.facts.get("birth", {}).get("unknown_time"))
        titles = PREVIEW_TITLES_NO_TIME if unknown_time else PREVIEW_TITLES
        spec = PREVIEW_NO_TIME if unknown_time else PREVIEW
        sheet = fact_sheet(req.facts, None)

    provider = OpenRouterProvider()
    system = system_prompt(req.lang, req.gender, req.product)
    user = section_prompt(spec, name="", sheet=sheet, written_so_far=[])
    try:
        completion = provider.complete(system, user, max_tokens=2000)
        report = check(completion.text, lang=req.lang, min_paragraphs=3, max_paragraphs=3)
        if not report.ok:
            # These are the first paragraphs a visitor reads, so they get the same second chance
            # a paid section does. It costs a cent and only happens when the editor objects.
            completion = provider.complete(
                system, f"{user}\n\n{repair_prompt(list(report.problems))}", max_tokens=2000
            )
            report = check(completion.text, lang=req.lang, min_paragraphs=3, max_paragraphs=3)
    except ModelUnavailableError as exc:
        raise HTTPException(503, f"model unavailable: {exc}") from exc

    parts = [p.strip() for p in re.split(r"\n\s*\n", completion.text.strip()) if p.strip()]
    blocks = [
        {"title": t.get(req.lang) or t["en"], "text": text}
        for t, text in zip(titles, parts[:3], strict=False)
    ]
    return {
        "blocks": blocks,
        "problems": list(report.problems),
        "tokens_in": completion.tokens_in,
        "tokens_out": completion.tokens_out,
        "cost_micros": completion.cost_micros,
        "model": completion.model,
    }


class HoroscopeRequest(BaseModel):
    """A week or a month for one chart.

    Takes the chart rather than the birth data: a subscription only needs the longitudes, and the
    fewer copies of a birth certificate travel between services, the better.
    """

    facts: dict[str, Any]
    period: Literal["week", "month"] = "week"
    #: The first day of the window. Absent means "from today".
    start: dt.date | None = None
    lang: str = Field(default="uk", pattern=r"^[a-z]{2}$")
    gender: Literal["f", "m", "n"] = "n"
    name: str = ""


#: How long each cadence runs. A month is 30 days rather than a calendar month so that the window
#: never depends on which month it starts in.
PERIOD_DAYS = {"week": 7, "month": 30}


def _longitudes(facts: dict[str, Any]) -> dict[Body, float]:
    out: dict[Body, float] = {}
    for position in facts.get("positions", []):
        try:
            out[Body(position["body"])] = float(position["longitude"])
        except (ValueError, KeyError, TypeError):
            continue
    return out


def _sky(when: dt.datetime, facts: dict[str, Any]) -> list[dict[str, Any]]:
    """Where the planets stand on the first day, and which natal house each one is crossing."""
    houses = facts.get("houses")
    cusps = tuple(c["longitude"] for c in houses["cusps"]) if houses else ()
    out: list[dict[str, Any]] = []
    for body, longitude in positions_at(when, PLANETS).items():
        out.append(
            {
                "body": body.value,
                "longitude": round(longitude, 4),
                "sign": Sign.of(longitude).key,
                "degree": format_degree(longitude),
                "house": house_of(longitude, cusps) if cusps else None,
            }
        )
    return out


@app.post("/v1/horoscope")
def horoscope(req: HoroscopeRequest) -> dict[str, Any]:
    """One window, one model call.

    The transiting bodies include the personal planets: over a week the outer planets barely move,
    and a horoscope built from them alone would say the same thing for two months.
    """
    natal = _longitudes(req.facts)
    if not natal:
        raise HTTPException(422, "the chart has no positions")

    start = dt.datetime.combine(req.start or dt.datetime.now(UTC).date(), dt.time(), tzinfo=UTC)
    end = start + dt.timedelta(days=PERIOD_DAYS[req.period])
    # Angles are natal targets, never transiting bodies.
    skip = (Body.DSC, Body.IC, Body.SOUTH_NODE, Body.VERTEX, Body.PARS_FORTUNAE)
    targets = tuple(b for b in natal if b not in skip)
    events = events_for(
        natal,
        start,
        end,
        bodies=(*PERSONAL_PLANETS, *OUTER_PLANETS),
        targets=targets,
    )
    transits = events_to_list(events)

    try:
        reading = write_horoscope(
            req.facts,
            provider=OpenRouterProvider(),
            sky=_sky(start, req.facts),
            transits=transits,
            period=req.period,
            start=start.date().isoformat(),
            end=end.date().isoformat(),
            lang=req.lang,
            name=req.name,
            gender=req.gender,
        )
    except ModelUnavailableError as exc:
        raise HTTPException(503, f"model unavailable: {exc}") from exc

    section = reading.sections[0]
    return {
        "title": section.title,
        "text": section.text,
        "period": req.period,
        "start": start.date().isoformat(),
        "end": end.date().isoformat(),
        "events": len(transits),
        "problems": list(section.problems),
        "tokens_in": reading.tokens_in,
        "tokens_out": reading.tokens_out,
        "cost_micros": reading.cost_micros,
        "model": reading.model,
    }


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
    #: The partner's name; only a synastry has one, and the sheet is written around the two names.
    second_name: str = ""


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
    system = system_prompt(req.lang, req.gender, req.product)
    if req.product == "synastry":
        sheet = synastry_sheet(req.facts, first_name=req.name, second_name=req.second_name or "—")
    else:
        # The transit list is the longest part of the sheet; only forecast sections pay for it.
        sheet = fact_sheet(req.facts, req.transits if spec.needs_transits else None)
    user = section_prompt(
        spec,
        name=req.name,
        sheet=sheet,
        written_so_far=req.written_so_far,
    )
    try:
        completion = provider.complete(system, user, max_tokens=MAX_TOKENS)
        report = check(
            completion.text,
            lang=req.lang,
            min_paragraphs=spec.paragraphs[0],
            max_paragraphs=spec.paragraphs[1],
            impersonal_ok=spec.impersonal_ok,
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
                impersonal_ok=spec.impersonal_ok,
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
    #: The partner's chart. For a synastry, `facts` is the payload from /v1/synastry and this is
    #: filled in from it by the caller.
    facts_second: dict[str, Any] | None = None
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
    if req.product not in SECTIONS:
        raise HTTPException(400, f"no skeleton for product: {req.product}")
    document = build_skeleton(
        req.facts,
        product=req.product,
        facts_second=req.facts_second,
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
            "content-disposition": 'attachment; filename="chronika.pdf"',
            # The caller records the page count with the document; counting it again would mean
            # parsing the PDF it just received.
            "x-pages": str(pages),
        },
    )


@app.get("/v1/zone")
def zone(
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
) -> dict[str, str]:
    try:
        return {"zone": zone_for(latitude, longitude)}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
