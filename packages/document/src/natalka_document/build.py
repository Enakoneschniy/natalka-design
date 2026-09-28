"""Document skeletons per product: the fixed structure that the text pipeline fills in.

The skeleton contains every computed block (wheel, positions, aspect grid) and the section list
derived from the legacy reading structure (reference/astrolog/examples/main.py). Text blocks are
added later by ``natalka_texts``; here they are empty.
"""

from __future__ import annotations

from typing import Any, Literal

from .labels import ui
from .schema import (
    AspectGrid,
    Birth,
    Cover,
    Document,
    Meta,
    Person,
    PositionsTable,
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
NO_TIME_SKIPPED = {"natal.ascendant", "natal.mc_career", "love.seventh_house"}

COVER_TITLE = {
    "uk": "Натальна карта",
    "en": "Birth chart",
    "ru": "Натальная карта",
    "pl": "Horoskop urodzeniowy",
    "de": "Geburtshoroskop",
}
COVER_SUBTITLE = {
    "uk": "індивідуальний розбір",
    "en": "a personal reading",
    "ru": "индивидуальный разбор",
    "pl": "analiza indywidualna",
    "de": "persönliche Deutung",
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


def natal_skeleton(
    facts: dict[str, Any],
    *,
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
    for sid, level in NATAL_SECTIONS:
        if birth.unknown_time and sid in NO_TIME_SKIPPED:
            continue
        sections.append(
            Section(
                id=sid, title=sid, level=level, page_break_before=(level == 1 and sid != "intro")
            )
        )
    return Document(
        meta=Meta(product="natal", lang=lang, order_ref=order_ref, engine_version=engine_version),
        person=person,
        birth=birth,
        cover=Cover(title=_t(COVER_TITLE, lang), subtitle=_t(COVER_SUBTITLE, lang)),
        facts=facts,
        transits=transits or [],
        sections=sections,
        closing_note=_t(CLOSING, lang),
        disclaimer=_t(DISCLAIMER, lang),
    )


__all__ = ["NATAL_SECTIONS", "NO_TIME_SKIPPED", "natal_skeleton", "ui"]
