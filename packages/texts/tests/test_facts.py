from natalka_texts import fact_sheet, synastry_sheet
from natalka_texts.facts import (
    angular_bodies,
    as_data,
    balance,
    clean_name,
    element_of,
    modality_of,
)


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


#: Where the fixture person was born, in every form the sheet used to print it.
WHERE = ("45.2", "45.19", "33.37", "33.36", "lat ", "lon ", "Simferopol", "UTC+4")


def test_the_sheet_says_when_but_not_where(facts: dict, facts_no_time: dict) -> None:
    """The privacy policy promises the model the chart and the name, not the place of birth."""
    sheet = fact_sheet(facts)
    assert "Birth: 1994-05-15 15:25" in sheet
    assert "Birth: 1994-05-15 time unknown" in fact_sheet(facts_no_time)
    pair = {"first": facts, "second": facts_no_time, "cross_aspects": [], "overlay": {}}
    for text in (
        sheet,
        fact_sheet(facts_no_time),
        synastry_sheet(pair, first_name="А", second_name="Б"),
    ):
        assert not [w for w in WHERE if w in text]


def test_names_go_in_as_one_quoted_line_of_at_most_80_characters() -> None:
    assert as_data("Оксана") == '"Оксана"'
    assert as_data('Ок"сана') == '"Ок\\"сана"'
    hostile = " Ок\n\nсана\t\x1b[2J\N{LINE SEPARATOR}\N{RIGHT-TO-LEFT OVERRIDE} "
    assert as_data(hostile) == '"Ок сана [2J"'
    assert as_data("Я" * 100) == f'"{"Я" * 80}"'
    assert clean_name("\r\n\x00") == ""
