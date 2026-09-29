"""Every product has to line up with the document it fills.

A section id that exists in one place and not the other produces a PDF with a missing chapter or
a paragraph nobody printed, and neither failure shows up until someone reads the document.
"""

import io

import pytest
from natalka_document.build import SECTIONS, fill_sections, skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Person
from natalka_texts.prompts import system_prompt
from natalka_texts.sections import BY_PRODUCT, specs

PRODUCTS = ("natal", "forecast", "child", "synastry")


@pytest.mark.parametrize("product", PRODUCTS)
def test_the_text_plan_matches_the_document_skeleton(product: str) -> None:
    text_ids = [s.id for s in BY_PRODUCT[product]]
    document_ids = [sid for sid, _ in SECTIONS[product]]
    assert text_ids == document_ids


@pytest.mark.parametrize("product", PRODUCTS)
def test_a_missing_birth_time_drops_the_same_sections_everywhere(
    product: str, facts_no_time: dict
) -> None:
    written = {s.id for s in specs(product, unknown_time=True)}
    document = skeleton(
        facts_no_time, product=product, person=Person(name="Оксана"), place="X", lang="uk"
    )
    kept = {s.id for s in document.sections if s.id != "chart"}
    assert kept == written


@pytest.mark.parametrize("product", PRODUCTS)
def test_every_product_renders(product: str, facts: dict) -> None:
    document = skeleton(
        facts, product=product, person=Person(name="Оксана", gender="f"), place="X", lang="uk"
    )
    body = "Перший абзац розбору.\n\nДругий абзац розбору.\n\nТретій абзац."
    filled = fill_sections(
        document, {s.id: (s.id, body, False) for s in document.sections if s.id != "chart"}
    )
    buffer = io.BytesIO()
    assert render_pdf(filled, buffer) > 3


def test_a_childs_reading_is_addressed_to_the_parent() -> None:
    prompt = system_prompt("ru", "f", "child")
    assert "parent" in prompt
    assert "Never address the child" in prompt


def test_a_natal_reading_has_no_extra_addressee_rules() -> None:
    assert "parent" not in system_prompt("ru", "f", "natal")


def test_a_synastry_sheet_names_both_people(facts: dict) -> None:
    from natalka_texts import synastry_sheet

    data = {
        "first": facts,
        "second": facts,
        "cross_aspects": [
            {"a": "sun", "b": "moon", "type": "trine", "orb": 1.2, "nature": "harmonious"}
        ],
        "overlay": {"first_in_second_houses": {"sun": 7}, "second_in_first_houses": {"moon": 4}},
    }
    sheet = synastry_sheet(data, first_name="Оксана", second_name="Ігор")
    assert "CHART A — Оксана" in sheet
    assert "CHART B — Ігор" in sheet
    # The contact reads as a sentence about two named people, not about "first" and "second".
    assert "sun of Оксана trine moon of Ігор" in sheet
    assert "WHERE Оксана LANDS IN THE LIFE OF Ігор" in sheet


def test_a_synastry_document_draws_both_charts(facts: dict) -> None:
    document = skeleton(
        facts,
        product="synastry",
        person=Person(name="Оксана", gender="f"),
        place="X",
        lang="uk",
        facts_second=facts,
    )
    chart = next(s for s in document.sections if s.id == "chart")
    wheels = [b for b in chart.blocks if b.type == "wheel"]
    assert [w.chart for w in wheels] == [1, 2]

    filled = fill_sections(
        document,
        {
            s.id: (s.id, "Абзац перший.\n\nАбзац другий.", False)
            for s in document.sections
            if s.id != "chart"
        },
    )
    buffer = io.BytesIO()
    assert render_pdf(filled, buffer) > 3
