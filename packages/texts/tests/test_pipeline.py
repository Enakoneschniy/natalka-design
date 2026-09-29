"""The whole chain in one test: engine facts → written sections → document → PDF.

It runs on a scripted provider, so it stays fast and free, and it is the test that would catch a
section id drifting apart between `natalka_texts.sections` and the document skeleton.
"""

import io
import re

from natalka_document.build import fill_sections, natal_skeleton
from natalka_document.render import render_pdf
from natalka_document.schema import Person
from natalka_texts import write_reading
from natalka_texts.providers import Completion


class SizedProvider:
    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        wanted = int(re.search(r"Length: (\d+)", user).group(1))
        body = "\n\n".join(
            f"Абзац {i + 1}: текст цього розділу, достатньо довгий, щоб потрапити в PDF."
            for i in range(wanted)
        )
        return Completion(
            text=body, tokens_in=1200, tokens_out=800, model="anthropic/claude-sonnet-5"
        )


def test_facts_become_a_pdf(facts: dict) -> None:
    reading = write_reading(facts, provider=SizedProvider(), name="Оксана", lang="uk", gender="f")
    document = natal_skeleton(
        facts, person=Person(name="Оксана", gender="f"), place="Євпаторія", lang="uk"
    )
    filled = fill_sections(document, {s.id: (s.title, s.text, s.quote) for s in reading.sections})

    # Every section the skeleton kept now carries text, and the chart pages are still there.
    assert filled.sections[0].id == "chart"
    assert all(s.blocks for s in filled.sections)

    buffer = io.BytesIO()
    pages = render_pdf(filled, buffer)
    assert pages > 10
    assert buffer.getvalue().startswith(b"%PDF")
    assert reading.cost_micros > 0


def test_an_unwritten_section_is_dropped_not_left_empty(facts: dict) -> None:
    document = natal_skeleton(
        facts, person=Person(name="Оксана", gender="f"), place="Євпаторія", lang="uk"
    )
    filled = fill_sections(document, {"intro": ("Вступ", "Один абзац.", False)})
    assert [s.id for s in filled.sections] == ["chart", "intro"]
