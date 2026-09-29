from natalka_texts import fact_sheet
from natalka_texts.facts import angular_bodies, balance, element_of, modality_of


def test_elements_and_modalities_follow_the_zodiac_order() -> None:
    assert element_of("aries") == "fire"
    assert element_of("taurus") == "earth"
    assert element_of("pisces") == "water"
    assert modality_of("aries") == "cardinal"
    assert modality_of("taurus") == "fixed"
    assert modality_of("gemini") == "mutable"


def test_balance_counts_only_the_ten_planets(facts: dict) -> None:
    counts = balance(facts)
    assert sum(counts["elements"].values()) == 10
    assert sum(counts["modalities"].values()) == 10


def test_angular_bodies_need_houses(facts: dict, facts_no_time: dict) -> None:
    assert angular_bodies(facts_no_time) == []
    # Whatever this chart has, every entry must name a body and an angle.
    for entry in angular_bodies(facts):
        assert "@" in entry


def test_fact_sheet_states_the_chart(facts: dict) -> None:
    sheet = fact_sheet(facts)
    assert "POSITIONS" in sheet
    assert "sun: 24°24′ taurus" in sheet
    assert "ASPECTS" in sheet
    assert "BALANCE" in sheet


def test_fact_sheet_is_explicit_about_a_missing_birth_time(facts_no_time: dict) -> None:
    sheet = fact_sheet(facts_no_time)
    assert "NO BIRTH TIME" in sheet
    assert "HOUSES" not in sheet
