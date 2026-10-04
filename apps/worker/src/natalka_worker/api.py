"""Internal HTTP API used by the web app: free preview calculation and the wheel SVG.

Not exposed publicly; the web app proxies it. No database access here.
"""

from __future__ import annotations

import datetime as dt
import io
import os
import re
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from natalka_document.build import SECTIONS, fill_sections
from natalka_document.build import skeleton as build_skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Brand, Document, Person
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
from natalka_texts.address import Address
from natalka_texts.generate import MAX_TOKENS, write_horoscope
from natalka_texts.prompts import repair_prompt, section_prompt, system_prompt
from natalka_texts.validate import check
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="Natalka internal API", version="0.1.0", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "build": os.environ.get("NATALKA_BUILD", "dev")}


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

    Takes the chart, the exact events in the window and where the sky stands on its first day —
    all computed by the ephemeris service — and writes the text. Nothing here needs birth data.
    """

    facts: dict[str, Any]
    transits: list[dict[str, Any]] = Field(default_factory=list)
    sky: list[dict[str, Any]] = Field(default_factory=list)
    period: Literal["week", "month"] = "week"
    start: dt.date
    end: dt.date
    lang: str = Field(default="uk", pattern=r"^[a-z]{2}$")
    gender: Literal["f", "m", "n"] = "n"
    name: str = ""


@app.post("/v1/horoscope")
def horoscope(req: HoroscopeRequest) -> dict[str, Any]:
    """One window, one model call."""
    if not req.facts.get("positions"):
        raise HTTPException(422, "the chart has no positions")
    try:
        reading = write_horoscope(
            req.facts,
            provider=OpenRouterProvider(),
            sky=req.sky,
            transits=req.transits,
            period=req.period,
            start=req.start.isoformat(),
            end=req.end.isoformat(),
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
        "start": req.start.isoformat(),
        "end": req.end.isoformat(),
        "events": len(req.transits),
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

    #: A field this image does not know is refused, not dropped: after a deploy skew an older image
    #: would otherwise ignore a seller's brand and answer as if nothing were missing.
    model_config = ConfigDict(extra="forbid")

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
    #: «вы» or «ты»: the seller's choice, applied to the prompt, the check and the titles.
    address: Address = "vy"


@app.get("/v1/sections")
def sections(
    product: Literal["natal", "forecast", "synastry", "child", "bundle"] = "natal",
    lang: str = "uk",
    unknown_time: bool = False,
    address: Address = "vy",
) -> dict[str, Any]:
    """The plan for a document: which sections to write, in order."""
    chosen = specs(product, unknown_time=unknown_time)
    return {
        "product": product,
        "sections": [
            {"id": s.id, "title": title(s, lang, address), "quote": s.quote} for s in chosen
        ],
    }


@app.post("/v1/section")
def section(req: SectionRequest) -> dict[str, Any]:
    spec = next((s for s in specs(req.product, unknown_time=False) if s.id == req.section_id), None)
    if spec is None:
        raise HTTPException(404, f"unknown section: {req.section_id}")

    provider = OpenRouterProvider()
    system = system_prompt(req.lang, req.gender, req.product, req.address)
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
            address=req.address,
            pair=(req.product == "synastry"),
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
                address=req.address,
                pair=(req.product == "synastry"),
            )
            # Keep the receipt of both attempts: the caller pays for them either way.
            return {
                "id": spec.id,
                "title": title(spec, req.lang, req.address),
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
        "title": title(spec, req.lang, req.address),
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

    #: A field this image does not know is refused, not dropped: after a deploy skew an older image
    #: would otherwise ignore a seller's brand and answer as if nothing were missing.
    model_config = ConfigDict(extra="forbid")

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
    address: Address = "vy"
    #: The seller's brand. When set, the document is the seller's, so the order reference stays out.
    brand: Brand | None = None


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
        order_ref=None if req.brand else req.order_ref,
        brand=req.brand,
        address=req.address,
        transits=req.transits,
        engine_version="ephemeris-service",
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
            "content-disposition": 'attachment; filename="reading.pdf"',
            # The caller records the page count with the document; counting it again would mean
            # parsing the PDF it just received.
            "x-pages": str(pages),
        },
    )
