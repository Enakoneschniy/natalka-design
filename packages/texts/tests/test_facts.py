from natalka_texts import fact_sheet, synastry_sheet
from natalka_texts.facts import (
    ELEMENTS,
    MODALITIES,
    WEIGHTED,
    angular_bodies,
    as_data,
    balance,
    clean_name,
    element_of,
    horoscope_sheet,
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


def test_balance_names_the_planets_in_each_element_and_modality(facts: dict) -> None:
    counts = balance(facts)
    signs = {p["body"]: p["sign"] for p in facts["positions"]}
    for element, bodies in counts["element_bodies"].items():
        assert len(bodies) == counts["elements"][element]
        assert all(element_of(signs[b]) == element for b in bodies)
    for modality, bodies in counts["modality_bodies"].items():
        assert len(bodies) == counts["modalities"][modality]
        assert all(modality_of(signs[b]) == modality for b in bodies)
    # Each of the ten planets once, in the usual order.
    named = [b for bodies in counts["element_bodies"].values() for b in bodies]
    assert sorted(named, key=WEIGHTED.index) == list(WEIGHTED)
    assert counts["element_bodies"]["earth"][0] == "sun"  # Sun in Taurus


def _balance_line(name: str, bodies: list[str]) -> str:
    return f"{name} {len(bodies)}: {', '.join(bodies) if bodies else 'none'}"


def test_fact_sheet_says_which_planets_make_each_count(facts: dict) -> None:
    """A count alone left the model to guess the planet: it put Mercury in Aries under air."""
    sheet = fact_sheet(facts)
    counts = balance(facts)
    for element in ELEMENTS:
        assert _balance_line(element, counts["element_bodies"][element]) in sheet.splitlines()
    for modality in MODALITIES:
        assert _balance_line(modality, counts["modality_bodies"][modality]) in sheet.splitlines()


def test_fact_sheet_gives_one_element_count_not_two(facts: dict) -> None:
    """The engine's weighted scores (earth 5, water 5, air 2, fire 1: thirteen, no planets named)
    sat beside the planet counts; the model wrote them up as «баллы» and named a planet for each.
    Only the counts with their planets go out; the rest of the engine's analysis still does."""
    assert sum(facts["analysis"]["elements"].values()) != 10  # the fixture has the weighted kind
    lines = fact_sheet(facts).splitlines()
    for key in (
        "ELEMENTS",
        "MODALITIES",
        "DOMINANT_ELEMENT",
        "WEAKEST_ELEMENT",
        "DOMINANT_MODALITY",
    ):
        assert not any(line.startswith(f"{key}:") for line in lines), key
    assert any(line.startswith("CONFIGURATIONS:") for line in lines)
    assert any(line.startswith("CHART_RULER:") for line in lines)


def test_horoscope_sheet_names_the_planets_of_each_element(facts: dict) -> None:
    sheet = horoscope_sheet(
        facts, sky=[], transits=[], period="week", start="2026-10-19", end="2026-10-26"
    )
    counts = balance(facts)
    for element in ELEMENTS:
        assert _balance_line(element, counts["element_bodies"][element]) in sheet.splitlines()


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
