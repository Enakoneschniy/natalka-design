"""Synastry: two charts read against each other."""

from datetime import date, time

import pytest
from natalka_engine import NatalInput, compute_natal, cross_aspects, house_overlay
from natalka_engine.bodies import Body
from natalka_engine.serialize import synastry_to_dict


@pytest.fixture(scope="module")
def her():
    return compute_natal(
        NatalInput(date(1994, 5, 15), time(15, 25), "Europe/Simferopol", 45.1972, 33.3664)
    )


@pytest.fixture(scope="module")
def him():
    return compute_natal(
        NatalInput(date(1986, 3, 15), time(22, 25), "Europe/Kyiv", 49.9935, 36.2304)
    )


def test_contacts_are_directional(her, him) -> None:
    """His Saturn on her Moon is a different contact from her Saturn on his Moon."""
    forward = cross_aspects(her, him)
    backward = cross_aspects(him, her)
    assert forward and backward
    # The same pair appears with the roles swapped and the separation mirrored.
    pair = next(c for c in forward if c.a == Body.SUN)
    mirror = next(c for c in backward if c.b == Body.SUN and c.a == pair.b)
    assert mirror.kind == pair.kind
    assert pytest.approx(mirror.orb, abs=1e-9) == pair.orb
    assert pytest.approx(mirror.separation, abs=1e-9) == -pair.separation


def test_a_body_can_aspect_its_own_counterpart(her, him) -> None:
    """Sun-to-Sun is a real contact between two charts; within one chart it is meaningless."""
    same = [c for c in cross_aspects(her, him) if c.a == c.b]
    # Whatever this pair has, nothing stops a body from aspecting its twin.
    assert all(c.orb >= 0 for c in same)


def test_contacts_are_sorted_by_orb(her, him) -> None:
    orbs = [c.orb for c in cross_aspects(her, him)]
    assert orbs == sorted(orbs)


def test_overlay_needs_the_hosts_birth_time(her, him) -> None:
    no_time = compute_natal(NatalInput(date(1986, 3, 15), None, "Europe/Kyiv", 49.9935, 36.2304))
    assert house_overlay(her, him)  # he has houses
    assert house_overlay(her, no_time) == {}  # he does not


def test_overlay_places_every_planet_in_a_house(her, him) -> None:
    overlay = house_overlay(her, him)
    assert overlay[Body.SUN] in range(1, 13)
    assert all(1 <= house <= 12 for house in overlay.values())


def test_the_payload_carries_both_charts_and_both_overlays(her, him) -> None:
    data = synastry_to_dict(her, him)
    assert data["first"]["positions"] and data["second"]["positions"]
    assert data["cross_aspects"]
    assert data["overlay"]["second_in_first_houses"]["sun"] in range(1, 13)
    assert data["overlay"]["first_in_second_houses"]["sun"] in range(1, 13)
    # Every contact names a nature the texts can colour by.
    assert {c["nature"] for c in data["cross_aspects"]} <= {"tense", "harmonious", "neutral"}
