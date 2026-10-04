"""The interface copy, checked the way the readings are.

A Ukrainian sentence shipped in the Russian interface for days: "Отримайте PDF" uses only letters
the two languages share, so no spell check and no letter-based rule could see it. What does show
it is that the string was identical in three files at once — the signature of a copy that was
never translated.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

MESSAGES = Path(__file__).resolve().parents[1] / "apps" / "web" / "messages"
#: The languages the site ships today (one file each). The site went Russian-only; the checks that
#: compare languages run only when the files they compare are there.
LANGUAGES = tuple(sorted(p.stem for p in MESSAGES.glob("*.json")))

#: Letters that belong to one language and not the other. A handful, but enough to catch a
#: sentence that wandered across.
FOREIGN = {"ru": "іїєґ", "uk": "ыэъё"}

#: Phrases that really are identical in Russian and Ukrainian. Single words are excluded from the
#: check entirely — "Венера", "Карта" and "Готово" are the same in both, and listing every one of
#: them would turn the test into a dictionary. A phrase of two words or more that matches exactly
#: is worth a second look.
IDENTICAL_BY_NATURE = {"до 1′", "12 400", "Гороскоп на {start} — {end}"}


def flatten(node: Any, path: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(node, dict):
        for key, value in node.items():
            out |= flatten(value, f"{path}.{key}" if path else key)
    elif isinstance(node, list):
        for i, value in enumerate(node):
            out |= flatten(value, f"{path}.{i}")
    elif isinstance(node, str):
        out[path] = node
    return out


@pytest.fixture(scope="module")
def messages() -> dict[str, dict[str, str]]:
    return {
        lang: flatten(json.loads((MESSAGES / f"{lang}.json").read_text())) for lang in LANGUAGES
    }


def _need(*langs: str) -> None:
    missing = [lang for lang in langs if lang not in LANGUAGES]
    if missing:
        pytest.skip(f"no {', '.join(missing)} messages shipped")


def test_the_site_ships_some_copy() -> None:
    assert LANGUAGES, f"no message files in {MESSAGES}"


def test_every_language_has_the_same_keys(messages: dict[str, dict[str, str]]) -> None:
    if len(LANGUAGES) < 2:
        pytest.skip("one language: nothing to compare")
    reference = set(messages[LANGUAGES[0]])
    for lang in LANGUAGES[1:]:
        assert set(messages[lang]) == reference, f"{lang} has different keys"


@pytest.mark.parametrize("lang", ["ru", "uk"])
def test_no_letters_from_the_other_language(lang: str, messages: dict[str, dict[str, str]]) -> None:
    _need(lang)
    pattern = re.compile(rf"\b[\w'’-]*[{FOREIGN[lang]}][\w'’-]*\b", re.IGNORECASE)
    bad = {key: value for key, value in messages[lang].items() if pattern.search(value)}
    assert not bad, f"{lang}: {bad}"


def test_the_russian_copy_is_not_the_ukrainian_one(messages: dict[str, dict[str, str]]) -> None:
    """A phrase identical in both files is usually one that was copied and never translated."""
    _need("ru", "uk")
    same = {
        key: value
        for key, value in messages["ru"].items()
        if value == messages["uk"].get(key)
        and len(value.split()) > 1
        and value not in IDENTICAL_BY_NATURE
    }
    assert not same, f"untranslated: {same}"


def test_the_english_copy_has_no_cyrillic(messages: dict[str, dict[str, str]]) -> None:
    _need("en")
    bad = {k: v for k, v in messages["en"].items() if re.search(r"[а-яіїєґ]", v, re.IGNORECASE)}
    assert not bad, f"english: {bad}"
