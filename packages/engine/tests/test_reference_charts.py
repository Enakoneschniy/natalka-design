"""Positions against external references. Planets ±1′, cusps ±1°."""

import json
from datetime import date, time
from pathlib import Path

import pytest
from natalka_engine import Body, NatalChart, NatalInput, Sign, compute_natal
from natalka_engine.bodies import delta

FIXTURES = Path(__file__).parent / "fixtures" / "reference_charts.json"
PLANET_TOL = 1 / 60 + 1e-9  # one arc-minute
CUSP_TOL = 1.0


def _lon(sign: str, deg: int, minute: int) -> float:
    return Sign[sign.upper()] * 30 + deg + minute / 60


def _check(chart: NatalChart, expected: dict[str, list]) -> list[str]:
    errors = []
    for key, (sign, d, m) in expected.items():
        body = Body(key)
        got = chart.positions[body].longitude
        want = _lon(sign, d, m)
        tol = CUSP_TOL if body in (Body.ASC, Body.MC) else PLANET_TOL
        # references are truncated/rounded to the minute → allow half a minute extra
        if abs(delta(got, want)) > tol + 0.5 / 60:
            errors.append(
                f"{key}: expected {sign} {d}°{m:02d}′, got {got % 30:.3f}° in {chart.positions[body].sign.key}"
            )
    return errors


def test_yevpatoria_brief_values(yevpatoria: NatalChart) -> None:
    assert (
        _check(
            yevpatoria,
            {
                "sun": ["taurus", 24, 24],
                "moon": ["cancer", 17, 32],
                "asc": ["virgo", 20, 34],
                "mc": ["gemini", 18, 34],
            },
        )
        == []
    )
    assert (
        yevpatoria.moment.utc_offset.total_seconds() == 4 * 3600
    )  # Crimea on Moscow time since 1994-05-01


def test_yevpatoria_wrong_zone_would_fail() -> None:
    """Guard: with plain Ukrainian time the ASC is off by ~19°, so the tz layer matters."""
    wrong = compute_natal(
        NatalInput(date(1994, 5, 15), time(15, 25), "Europe/Kyiv", 45.1972, 33.3664)
    )
    assert abs(delta(wrong.positions[Body.ASC].longitude, _lon("virgo", 20, 34))) > 10


def test_kharkiv_legacy_table(kharkiv: NatalChart) -> None:
    """The legacy reading's table, read manually from an image. Everything matches to the minute
    except Mars, which the old pipeline placed in Virgo — it was in Sagittarius."""
    legacy = {
        "sun": ["pisces", 24, 55],
        "moon": ["taurus", 23, 36],
        "mercury": ["pisces", 26, 50],
        "venus": ["aries", 8, 17],
        "jupiter": ["pisces", 5, 30],
        "saturn": ["sagittarius", 9, 41],
        "uranus": ["sagittarius", 22, 18],
        "neptune": ["capricorn", 5, 39],
        "pluto": ["scorpio", 7, 1],
        "north_node": ["taurus", 0, 23],
        "asc": ["scorpio", 6, 11],
        "mc": ["leo", 18, 9],
    }
    assert _check(kharkiv, legacy) == []
    mars = kharkiv.positions[Body.MARS]
    assert mars.sign == Sign.SAGITTARIUS
    assert abs(mars.degree_in_sign - (23 + 33 / 60)) < PLANET_TOL + 0.5 / 60
    assert kharkiv.positions[Body.MERCURY].retrograde and kharkiv.positions[Body.PLUTO].retrograde


@pytest.mark.skipif(not FIXTURES.exists(), reason="reference fixtures not provided yet")
def test_astroseek_fixtures() -> None:
    data = json.loads(FIXTURES.read_text())
    failures = []
    for entry in data["charts"]:
        b = entry["birth"]
        chart = compute_natal(
            NatalInput(
                date.fromisoformat(b["date"]),
                time.fromisoformat(b["time"]) if b.get("time") else None,
                b["zone"],
                b["lat"],
                b["lon"],
            )
        )
        for err in _check(chart, entry["expected"]):
            failures.append(f"{entry['id']}: {err}")
    assert failures == []
