"""Document skeletons per product: the fixed structure that the text pipeline fills in.

The skeleton contains every computed block (wheel, positions, aspect grid) and the section list
derived from the legacy reading structure (reference/astrolog/examples/main.py). Text blocks are
added later by ``natalka_texts``; here they are empty.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from .labels import ui
from .schema import (
    AspectGrid,
    Birth,
    Block,
    Cover,
    Document,
    Meta,
    Paragraph,
    Person,
    PositionsTable,
    Product,
    Quote,
    Section,
    WheelBlock,
)

# Section ids are stable keys shared with the prompts; titles are localised by the text pipeline.
NATAL_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    ("intro", 1),
    ("natal.overview", 1),
    ("natal.ascendant", 2),
    ("natal.sun", 2),
    ("natal.moon", 2),
    ("natal.mercury_venus_mars", 2),
    ("natal.social", 2),  # Jupiter, Saturn
    ("natal.outer", 2),  # Uranus, Neptune, Pluto, Chiron, Lilith, nodes
    ("natal.mc_career", 2),
    ("natal.key_aspects", 2),
    ("love", 1),
    ("love.seventh_house", 2),
    ("love.venus_moon", 2),
    ("love.partner", 2),
    ("love.advice", 2),
    ("work", 1),
    ("work.picture", 2),
    ("work.money", 2),
    ("work.now", 2),
    ("transits", 1),
    ("transits.past", 2),
    ("transits.now", 2),
    ("transits.year1", 2),
    ("transits.year2", 2),
    ("transits.year3", 2),
    ("summary", 1),
    ("ps", 1),
)
#: A twelve-month forecast: the natal chart is the ground, the transits are the subject.
FORECAST_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    ("intro", 1),
    ("forecast.ground", 1),
    ("forecast.year", 1),
    ("forecast.q1", 2),
    ("forecast.q2", 2),
    ("forecast.q3", 2),
    ("forecast.q4", 2),
    ("forecast.slow", 1),
    ("forecast.work", 2),
    ("forecast.love", 2),
    ("forecast.advice", 1),
    ("ps", 1),
)

#: A child's chart, written for the parents rather than for the child.
CHILD_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    ("intro", 1),
    ("child.overview", 1),
    ("child.temper", 2),
    ("child.needs", 2),
    ("child.learning", 2),
    ("child.rest", 2),
    ("child.hurts", 2),
    ("child.language", 1),
    ("child.parent", 2),
    ("child.years", 1),
    ("ps", 1),
)

SECTIONS: dict[str, tuple[tuple[str, Literal[1, 2]], ...]] = {
    "natal": NATAL_SECTIONS,
    "forecast": FORECAST_SECTIONS,
    "child": CHILD_SECTIONS,
}

NO_TIME_SKIPPED = {
    "natal.ascendant",
    "natal.mc_career",
    "love.seventh_house",
    "child.language",
}

COVER_TITLE: dict[str, dict[str, str]] = {
    "natal": {
        "uk": "Натальна карта",
        "en": "Birth chart",
        "ru": "Натальная карта",
        "pl": "Horoskop urodzeniowy",
        "de": "Geburtshoroskop",
    },
    "forecast": {
        "uk": "Прогноз на 12 місяців",
        "en": "A twelve-month forecast",
        "ru": "Прогноз на 12 месяцев",
        "pl": "Prognoza na 12 miesięcy",
        "de": "Prognose für zwölf Monate",
    },
    "child": {
        "uk": "Дитяча карта",
        "en": "A child's chart",
        "ru": "Детская карта",
        "pl": "Horoskop dziecka",
        "de": "Kinderhoroskop",
    },
}
COVER_SUBTITLE: dict[str, dict[str, str]] = {
    "natal": {
        "uk": "індивідуальний розбір",
        "en": "a personal reading",
        "ru": "индивидуальный разбор",
        "pl": "analiza indywidualna",
        "de": "persönliche Deutung",
    },
    "forecast": {
        "uk": "за транзитами вашої карти",
        "en": "from the transits to your chart",
        "ru": "по транзитам вашей карты",
        "pl": "według tranzytów twojej karty",
        "de": "nach den Transiten Ihres Horoskops",
    },
    "child": {
        "uk": "для батьків",
        "en": "for the parents",
        "ru": "для родителей",
        "pl": "dla rodziców",
        "de": "für die Eltern",
    },
}
CHART_SECTION_TITLE = {
    "uk": "Ваша карта",
    "en": "Your chart",
    "ru": "Ваша карта",
    "pl": "Twoja karta",
    "de": "Ihr Horoskop",
}
DISCLAIMER = {
    "uk": "Розбір має розважально-пізнавальний характер і не є медичною, психологічною чи фінансовою порадою.",
    "en": "This reading is for entertainment and self-reflection and is not medical, psychological or financial advice.",
    "ru": "Разбор носит развлекательно-познавательный характер и не является медицинским, психологическим или финансовым советом.",
    "pl": "Analiza ma charakter rozrywkowo-poznawczy i nie jest poradą medyczną, psychologiczną ani finansową.",
    "de": "Die Deutung dient der Unterhaltung und Selbstreflexion und ist keine medizinische, psychologische oder finanzielle Beratung.",
}
CLOSING = {
    "uk": "✦  на цьому розбір завершено  ✦",
    "en": "✦  end of the reading  ✦",
    "ru": "✦  на этом разбор завершён  ✦",
    "pl": "✦  koniec analizy  ✦",
    "de": "✦  Ende der Deutung  ✦",
}


def _t(table: dict[str, str], lang: str) -> str:
    return table.get(lang, table["en"])


def skeleton(
    facts: dict[str, Any],
    *,
    product: Product = "natal",
    person: Person,
    place: str,
    lang: str,
    order_ref: str | None = None,
    transits: list[dict[str, Any]] | None = None,
    engine_version: str = "",
) -> Document:
    b = facts["birth"]
    birth = Birth(
        date=b["date"],
        time=b["time"],
        unknown_time=bool(b["unknown_time"]),
        place=place,
        zone=b["zone"],
        utc_offset=b["utc_offset"],
        latitude=b["latitude"],
        longitude=b["longitude"],
    )
    chart_section = Section(
        id="chart",
        title=_t(CHART_SECTION_TITLE, lang),
        eyebrow="",
        page_break_before=True,
        blocks=[WheelBlock(size="full"), PositionsTable(highlight="sun"), AspectGrid()],
    )
    sections = [chart_section]
    for sid, level in SECTIONS[product]:
        if birth.unknown_time and sid in NO_TIME_SKIPPED:
            continue
        sections.append(
            Section(
                id=sid, title=sid, level=level, page_break_before=(level == 1 and sid != "intro")
            )
        )
    return Document(
        meta=Meta(product=product, lang=lang, order_ref=order_ref, engine_version=engine_version),
        person=person,
        birth=birth,
        cover=Cover(
            title=_t(COVER_TITLE[product], lang), subtitle=_t(COVER_SUBTITLE[product], lang)
        ),
        facts=facts,
        transits=transits or [],
        sections=sections,
        closing_note=_t(CLOSING, lang),
        disclaimer=_t(DISCLAIMER, lang),
    )


def fill_sections(
    document: Document,
    texts: dict[str, tuple[str, str, bool]],
) -> Document:
    """Put written text into a skeleton.

    ``texts`` maps a section id to ``(title, body, pull_quote)``. The body is split on blank lines
    into paragraphs; when ``pull_quote`` is set the last paragraph is lifted out as a quote, which
    is how the reference documents break up a long stretch of prose. Sections with no text are
    dropped rather than left empty — an empty heading in a paid PDF looks like a bug.
    """
    kept: list[Section] = []
    for section in document.sections:
        if section.id == "chart":
            kept.append(section)
            continue
        entry = texts.get(section.id)
        if entry is None:
            continue
        heading, body, pull_quote = entry
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
        if not paragraphs:
            continue
        blocks: list[Block] = []
        if pull_quote and len(paragraphs) > 2:
            *rest, last = paragraphs
            blocks.extend(Paragraph(text=p) for p in rest)
            blocks.append(Quote(text=last))
        else:
            blocks.extend(Paragraph(text=p) for p in paragraphs)
        kept.append(section.model_copy(update={"title": heading, "blocks": blocks}))
    return document.model_copy(update={"sections": kept})


#: The natal skeleton by its old name — the only product that existed when it was written.
def natal_skeleton(facts: dict[str, Any], **kwargs: Any) -> Document:
    return skeleton(facts, product="natal", **kwargs)


__all__ = [
    "CHILD_SECTIONS",
    "FORECAST_SECTIONS",
    "NATAL_SECTIONS",
    "NO_TIME_SKIPPED",
    "SECTIONS",
    "fill_sections",
    "natal_skeleton",
    "skeleton",
    "ui",
]
