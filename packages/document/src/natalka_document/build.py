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
    DatesTable,
    Document,
    Meta,
    PageBreak,
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
    ("summary", 1),
    ("ps", 1),
)
#: The time half: the years in calendar order. Sold inside the bundle and on its own.
TRANSIT_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    ("time.intro", 1),
    ("time.past", 2),
    ("time.now", 2),
    ("time.rest", 2),
    ("time.next.q1", 2),
    ("time.next.q2", 2),
    ("time.next.q3", 2),
    ("time.next.q4", 2),
    ("time.after", 2),
    ("time.work", 2),
    ("time.love", 2),
    ("time.advice", 1),
)
#: A twelve-month forecast on its own: the natal chart is the ground, the years are the subject.
FORECAST_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    ("forecast.ground", 1),
    *TRANSIT_SECTIONS,
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

#: Two charts read against each other.
SYNASTRY_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    ("intro", 1),
    ("synastry.each", 1),
    ("synastry.pull", 1),
    ("synastry.friction", 1),
    ("synastry.houses", 2),
    ("synastry.talk", 2),
    ("synastry.long", 1),
    ("synastry.advice", 1),
    ("ps", 1),
)

#: The bundle is the natal reading plus the month-level detail the forecast adds on top of it.
#: Only the quarters, the slow transits and the advice come across: the forecast's own opening,
#: its natal ground and its work/love chapters would all repeat what the natal reading just said.
BUNDLE_SECTIONS: tuple[tuple[str, Literal[1, 2]], ...] = (
    *(s for s in NATAL_SECTIONS if s[0] not in ("summary", "ps")),
    *TRANSIT_SECTIONS,
    ("summary", 1),
    ("ps", 1),
)

SECTIONS: dict[str, tuple[tuple[str, Literal[1, 2]], ...]] = {
    "natal": NATAL_SECTIONS,
    "bundle": BUNDLE_SECTIONS,
    "forecast": FORECAST_SECTIONS,
    "child": CHILD_SECTIONS,
    "synastry": SYNASTRY_SECTIONS,
}

NO_TIME_SKIPPED = {
    "natal.ascendant",
    "natal.mc_career",
    "love.seventh_house",
    "child.language",
    "synastry.houses",
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
    "synastry": {
        "uk": "Сумісність",
        "en": "Compatibility",
        "ru": "Совместимость",
        "pl": "Zgodność",
        "de": "Partnerschaft",
    },
    "bundle": {
        "uk": "Натальна карта і прогноз",
        "en": "Birth chart and forecast",
        "ru": "Натальная карта и прогноз",
        "pl": "Horoskop i prognoza",
        "de": "Geburtshoroskop und Prognose",
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
    "synastry": {
        "uk": "дві карти поряд",
        "en": "two charts side by side",
        "ru": "две карты рядом",
        "pl": "dwie karty obok siebie",
        "de": "zwei Horoskope nebeneinander",
    },
    "bundle": {
        "uk": "розбір і дванадцять місяців наперед",
        "en": "a reading and the twelve months ahead",
        "ru": "разбор и двенадцать месяцев вперёд",
        "pl": "analiza i dwanaście miesięcy naprzód",
        "de": "Deutung und die nächsten zwölf Monate",
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


#: The title of the computed page of dates, in the document's language.
DATES_TITLE = {
    "uk": "Головні дати",
    "en": "The main dates",
    "ru": "Главные даты",
    "pl": "Najważniejsze daty",
    "de": "Die wichtigsten Daten",
}


def skeleton(
    facts: dict[str, Any],
    *,
    product: Product = "natal",
    person: Person,
    facts_second: dict[str, Any] | None = None,
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
    if product == "synastry":
        # Two charts, each with its own wheel and table; the contacts between them live in the
        # prose rather than in a grid, which would need a second aspect matrix to read.
        chart_blocks: list[Block] = [
            WheelBlock(size="full", chart=1),
            PositionsTable(highlight="sun", chart=1),
            PageBreak(),
            WheelBlock(size="full", chart=2),
            PositionsTable(highlight="sun", chart=2),
        ]
    else:
        chart_blocks = [WheelBlock(size="full"), PositionsTable(highlight="sun"), AspectGrid()]
    chart_section = Section(
        id="chart",
        title=_t(CHART_SECTION_TITLE, lang),
        eyebrow="",
        page_break_before=True,
        blocks=chart_blocks,
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
    # The page of dates: computed, not written, so it costs nothing and is the page a reader
    # comes back to. Only the products that carry a window of time have one, and it sits at the
    # end, where a reference page belongs.
    if transits and product in ("forecast", "bundle"):
        sections.append(
            Section(
                id="dates",
                title=_t(DATES_TITLE, lang),
                level=1,
                page_break_before=True,
                blocks=[DatesTable()],
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
        facts_second=facts_second,
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
        # Computed sections carry their own blocks and no written text.
        if section.id in ("chart", "dates"):
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
    "BUNDLE_SECTIONS",
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
