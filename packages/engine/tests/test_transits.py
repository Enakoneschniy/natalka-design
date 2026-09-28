"""Transit dates are computed, not remembered. Compared with published ephemeris dates and with the
claims of the legacy reading (reference/astrolog/examples/content_timeline.py)."""

from datetime import UTC, date, datetime

from natalka_engine import AspectType, Body, NatalChart, Sign
from natalka_engine.transits import exact_hits, sign_ingresses, transit_events

W = (datetime(2025, 1, 1, tzinfo=UTC), datetime(2028, 12, 31, tzinfo=UTC))


def _dates(events: list) -> list[date]:
    return [e.when.date() for e in events]


def test_published_ingresses() -> None:
    """Well-known ingress dates (Astrodienst ephemeris)."""
    uranus = sign_ingresses(Body.URANUS, *W)
    assert [(i.sign, i.when.date(), i.retrograde) for i in uranus] == [
        (Sign.GEMINI, date(2025, 7, 7), False),
        (Sign.TAURUS, date(2025, 11, 8), True),
        (Sign.GEMINI, date(2026, 4, 26), False),
    ]
    jupiter = sign_ingresses(Body.JUPITER, *W)
    assert [(i.sign, i.when.date()) for i in jupiter][:2] == [
        (Sign.CANCER, date(2025, 6, 9)),
        (Sign.LEO, date(2026, 6, 30)),
    ]
    saturn = sign_ingresses(Body.SATURN, *W)
    assert [(i.sign, i.when.date()) for i in saturn] == [
        (Sign.ARIES, date(2025, 5, 25)),
        (Sign.PISCES, date(2025, 9, 1)),
        (Sign.ARIES, date(2026, 2, 14)),
        (Sign.TAURUS, date(2028, 4, 13)),
    ]


def test_legacy_claims_vs_engine(kharkiv: NatalChart) -> None:
    """What the legacy text claimed (from memory) vs what the ephemeris says.

    Uranus → Gemini 26.04.2026 was right. Jupiter → Cancer was a year early (2025, not 2026),
    Saturn ∘ Sun happened once on 04.04.2025 (not Feb/Sep 2026), Pluto □ Pluto starts 12.04.2027
    (not January), Saturn → Taurus is 13.04.2028 (not 11.06.2027). These are the reasons the engine
    exists; the assertions pin the computed values so a regression is caught.
    """
    lon = kharkiv.longitudes
    sat_sun = exact_hits(
        Body.SATURN,
        Body.SUN,
        lon[Body.SUN],
        AspectType.CONJUNCTION,
        datetime(2024, 1, 1, tzinfo=UTC),
        W[1],
    )
    assert _dates(sat_sun) == [date(2025, 4, 4)]
    sat_ven = exact_hits(Body.SATURN, Body.VENUS, lon[Body.VENUS], AspectType.CONJUNCTION, *W)
    assert _dates(sat_ven) == [date(2026, 4, 23), date(2026, 11, 21), date(2026, 12, 30)]
    assert [h.retrograde for h in sat_ven] == [False, True, False]
    plu = exact_hits(Body.PLUTO, Body.PLUTO, lon[Body.PLUTO], AspectType.SQUARE, *W)
    assert _dates(plu)[0] == date(2027, 4, 12) and plu[0].passes == 5
    jup_mc = exact_hits(Body.JUPITER, Body.MC, lon[Body.MC], AspectType.CONJUNCTION, *W)
    assert _dates(jup_mc) == [date(2026, 9, 23), date(2027, 3, 16), date(2027, 5, 10)]


def test_transit_events_sorted_and_typed(kharkiv: NatalChart) -> None:
    events = transit_events(
        kharkiv,
        datetime(2026, 1, 1, tzinfo=UTC),
        datetime(2026, 12, 31, tzinfo=UTC),
        bodies=(Body.JUPITER, Body.SATURN, Body.URANUS),
    )
    assert events == sorted(events, key=lambda e: e.when)
    kinds = {e.kind for e in events}
    assert kinds == {"ingress", "aspect"}
    assert any(
        e.kind == "ingress" and e.body == Body.URANUS and e.sign == Sign.GEMINI for e in events
    )
