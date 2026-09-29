"""Every product has to line up with the document it fills.

A section id that exists in one place and not the other produces a PDF with a missing chapter or
a paragraph nobody printed, and neither failure shows up until someone reads the document.
"""

import pytest
from natalka_document.build import SECTIONS, fill_sections, skeleton
from natalka_document.schema import Person
from natalka_texts.prompts import system_prompt
from natalka_texts.sections import BY_PRODUCT, specs

PRODUCTS = ("natal", "forecast", "child")


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
    import io

    from natalka_document.render import render_pdf

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
