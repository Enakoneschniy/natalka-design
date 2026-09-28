from datetime import date, time, timedelta

import pytest
from natalka_engine import AspectType, Body, Sign, find_aspects
from natalka_engine.bodies import delta, format_degree
from natalka_engine.chart import house_of
from natalka_engine.geo import zone_for
from natalka_engine.timeutil import to_utc


def test_delta_and_format() -> None:
    assert delta(350, 10) == 20
    assert delta(10, 350) == -20
    assert delta(0, 180) == 180
    assert format_degree(54.4066) == "24°24′"
    assert format_degree(29.9999) == "29°59′"


def test_house_of() -> None:
    cusps = tuple(float(i * 30) for i in range(12))
    assert house_of(0, cusps) == 1 and house_of(29.99, cusps) == 1 and house_of(30, cusps) == 2
    rotated = tuple((i * 30 + 100.0) % 360 for i in range(12))  # cusp 1 at 100°
    assert (
        house_of(100, rotated) == 1 and house_of(99.9, rotated) == 12 and house_of(0, rotated) == 9
    )


def test_aspects_orbs_and_applying() -> None:
    lons = {Body.SUN: 10.0, Body.MOON: 130.5, Body.MARS: 100.0, Body.SATURN: 199.0}
    speeds = {Body.SUN: 1.0, Body.MOON: 13.0, Body.MARS: 0.6, Body.SATURN: 0.1}
    found = {(a.a, a.b): a for a in find_aspects(lons, speeds)}
    assert found[(Body.SUN, Body.MOON)].kind == AspectType.TRINE
    assert found[(Body.SUN, Body.MARS)].kind == AspectType.SQUARE
    sat = found[(Body.SUN, Body.SATURN)]
    assert (
        sat.kind == AspectType.OPPOSITION and sat.orb == pytest.approx(9.0) and sat.applying is True
    )  # Sun closes in on 19°
    assert (Body.MARS, Body.SATURN) not in found  # 99° square is outside 7°


def test_time_zones() -> None:
    assert to_utc(date(1994, 5, 15), time(15, 25), "Europe/Simferopol").utc_offset == timedelta(
        hours=4
    )
    assert to_utc(date(1994, 4, 15), time(15, 25), "Europe/Simferopol").utc_offset == timedelta(
        hours=3
    )
    assert to_utc(date(1986, 3, 15), time(22, 25), "Europe/Kyiv").utc_offset == timedelta(
        hours=3
    )  # MSK
    assert to_utc(date(1986, 7, 15), time(12, 0), "Europe/Kyiv").utc_offset == timedelta(
        hours=4
    )  # MSD
    assert to_utc(date(1992, 7, 15), time(12, 0), "Europe/Kyiv").utc_offset == timedelta(
        hours=3
    )  # EEST
    noon = to_utc(date(1990, 1, 1), None, "Europe/Warsaw")
    assert noon.utc.hour == 11
    skipped = to_utc(date(2024, 3, 31), time(3, 30), "Europe/Kyiv")  # 03:00→04:00 gap
    assert skipped.nonexistent and skipped.utc.hour == 1
    twice = to_utc(date(2024, 10, 27), time(3, 30), "Europe/Kyiv")  # 04:00→03:00 repeat
    assert twice.ambiguous and twice.utc.hour == 0


def test_zone_lookup() -> None:
    assert zone_for(49.9935, 36.2304) in ("Europe/Kyiv", "Europe/Kiev")
    assert zone_for(45.1972, 33.3664) == "Europe/Simferopol"
    assert zone_for(52.23, 21.01) == "Europe/Warsaw"


def test_sign_helpers() -> None:
    assert Sign.of(359.9) == Sign.PISCES and Sign.of(360.0) == Sign.ARIES
    assert Sign.TAURUS.element.value == "earth" and Sign.TAURUS.modality.value == "fixed"
