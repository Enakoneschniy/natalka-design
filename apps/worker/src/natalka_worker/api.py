"""Internal HTTP API used by the web app: free preview calculation and the wheel SVG.

Not exposed publicly; the web app proxies it. No database access here.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict
from datetime import UTC
from typing import Annotated, Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
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
