"""The editor that reads every section before it reaches the document.

Two kinds of check. The first is style: phrases that mark a text as machine-written, which the
style guide bans outright. The second matters more — sentences that imply we know something about
this person that the chart cannot tell us. A paid reading loses all its credibility the moment it
says "you wrote that", because the reader knows they wrote nothing.

A section that fails is regenerated once with the problems fed back; if it fails again the caller
decides what to do.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Phrases that betray a source we do not have. Checked per language we ship.
IMPLIES_KNOWLEDGE: dict[str, tuple[str, ...]] = {
    "ru": (
        "вы писали",
        "вы говорили",
        "вы рассказывали",
        "как вы знаете",
        "как вы сами",
        "вы сейчас переживаете",
        "у вас сейчас не клеится",
        "вы упомянули",
        "из вашего письма",
    ),
    "uk": (
        "ви писали",
        "ви казали",
        "ви розповідали",
        "як ви знаєте",
        "як ви самі",
        "ви зараз переживаєте",
        "ви згадували",
        "з вашого листа",
    ),
    "en": (
        "you wrote",
        "you told me",
        "you mentioned",
        "as you know",
        "as you said",
        "you are going through",
        "in your message",
    ),
}

#: Machine-writing tells from the style guide.
CLICHES: dict[str, tuple[str, ...]] = {
    "ru": (
        "в современном мире",
        "в наш стремительный век",
        "ключевой аспект",
        "является свидетельством",
        "подчёркивает важность",
        "давайте погрузимся",
        "давайте рассмотрим",
        "давайте разберём",
        "в заключение",
        "подводя итог",
        "стоит отметить",
        "важно понимать",
    ),
    "uk": (
        "у сучасному світі",
        "ключовий аспект",
        "є свідченням",
        "підкреслює важливість",
        "давайте зануримося",
        "давайте розглянемо",
        "на завершення",
        "підбиваючи підсумок",
        "варто зазначити",
        "важливо розуміти",
    ),
    "en": (
        "in today's world",
        "in our fast-paced",
        "a key aspect",
        "is a testament to",
        "underscores the importance",
        "let's dive in",
        "let's explore",
        "in conclusion",
        "to sum up",
        "it's worth noting",
        "it's important to understand",
    ),
}

#: The reading is written on formal terms. A model that slips into «ты» has not made a stylistic
#: choice — it has changed the relationship, in a document someone paid for.
#:
#: Matched on word boundaries, not as substrings: "робити" ends in "ти" and "основы" ends in "вы",
#: and a plain `in` check turns both into false accusations.
INFORMAL = {
    "ru": re.compile(r"\b(ты|теб[яе]|тобой|тво[йяёеи]\w*)\b", re.IGNORECASE),
    "uk": re.compile(r"\b(ти|тоб[іи]|тебе|тобою|тво[їяєё]\w*)\b", re.IGNORECASE),
}

#: A section written *about* the reader instead of *to* them reads like a horoscope column and
#: slips into the wrong gender. Any real section of a reading addresses them at least once.
SECOND_PERSON = {
    "ru": re.compile(r"\b(вы|вас|вам|вами|ваш\w*)\b", re.IGNORECASE),
    "uk": re.compile(r"\b(ви|вас|вам|вами|ваш\w*)\b", re.IGNORECASE),
    "en": re.compile(r"\b(you|your|yours)\b", re.IGNORECASE),
}
#: Below this a section is an opening or a closing line, where an impersonal sentence is fine.
ADDRESS_MIN_CHARS = 400

#: Ukrainian and Russian share an alphabet except for a handful of letters, and those letters are
#: enough to catch the mixing: a model writing a Russian reading slips in «і», «ї», «є» or «ґ»,
#: and a Ukrainian one slips in «ы», «э», «ъ» or «ё». Two or three of them in a section is not a
#: typo, it is a sentence in the wrong language.
FOREIGN_LETTERS = {"ru": "іїєґ", "uk": "ыэъё"}


def _foreign_words(text: str, letters: str) -> set[str]:
    pattern = rf"\b[\w'’-]*[{letters}][\w'’-]*\b"
    return {m.group(0) for m in re.finditer(pattern, text, re.IGNORECASE)}


#: Latin letters inside a Cyrillic word, or a stray Latin word: models occasionally slip one in
#: ("на practике"), and in a paid document it reads as a typo nobody proofread. These are the
#: Latin strings a Russian or Ukrainian reading may legitimately contain.
LATIN_OK = frozenset({"mc", "ic", "asc", "dc", "ac", "pdf", "r", "utc", "natalka", "id", "ok"})
CYRILLIC_LANGS = frozenset({"ru", "uk", "bg"})
LATIN_WORD = re.compile(r"\b[A-Za-z][A-Za-z'’-]{1,}\b")
MIXED_WORD = re.compile(r"\b(?=\w*[А-Яа-яЁёІіЇїЄєҐґ])(?=\w*[A-Za-z])\w+\b")

#: Only these survive into the PDF; anything else means the model ignored the format rules.
ALLOWED_TAGS = re.compile(r"</?(b|i|br\s*/?)>", re.IGNORECASE)
ANY_TAG = re.compile(r"<[^>]+>")
MARKDOWN = re.compile(r"^\s{0,3}(#{1,6}\s|\*\s|-\s|\d+\.\s)", re.MULTILINE)


@dataclass(frozen=True, slots=True)
class Report:
    problems: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not self.problems


def _found(text: str, needles: tuple[str, ...]) -> list[str]:
    low = text.lower()
    return [n for n in needles if n in low]


def _language_problems(text: str, lang: str, *, impersonal_ok: bool = False) -> list[str]:
    """Checks that only make sense for a given language: banned phrases, stray Latin, address."""
    problems: list[str] = []
    for phrase in _found(text, IMPLIES_KNOWLEDGE.get(lang, ())):
        problems.append(f'"{phrase}" implies we know something the chart cannot tell us')
    for phrase in _found(text, CLICHES.get(lang, ())):
        problems.append(f'"{phrase}" is on the banned list in the style guide')

    if lang in CYRILLIC_LANGS:
        mixed = MIXED_WORD.findall(text)
        if mixed:
            problems.append(f"Latin letters inside a word: {', '.join(sorted(set(mixed))[:3])}")
        latin = [w for w in LATIN_WORD.findall(text) if w.lower() not in LATIN_OK]
        if latin:
            problems.append(f"untranslated Latin words: {', '.join(sorted(set(latin))[:3])}")

    letters = FOREIGN_LETTERS.get(lang)
    if letters:
        words = _foreign_words(text, letters)
        if words:
            problems.append(f"words from the other language: {', '.join(sorted(words)[:3])}")

    informal_re = INFORMAL.get(lang)
    informal = informal_re.search(text) if informal_re else None
    if informal:
        problems.append(
            f"addresses the reader informally ({informal.group(0)}); the reading is on «вы»"
        )

    if not impersonal_ok and len(text) > ADDRESS_MIN_CHARS:
        formal = SECOND_PERSON.get(lang)
        if formal and not formal.search(text) and not informal:
            problems.append("the section talks about the reader instead of addressing them")
    return problems


def check(
    text: str,
    *,
    lang: str,
    min_paragraphs: int,
    max_paragraphs: int,
    impersonal_ok: bool = False,
) -> Report:
    problems: list[str] = []

    stripped = text.strip()
    if not stripped:
        return Report(("the section is empty",))

    paragraphs = [p for p in re.split(r"\n\s*\n", stripped) if p.strip()]
    if len(paragraphs) < min_paragraphs:
        problems.append(
            f"only {len(paragraphs)} paragraphs, at least {min_paragraphs} were asked for"
        )
    # One over is fine — the model often splits a long paragraph; two over means it ignored the brief.
    if len(paragraphs) > max_paragraphs + 1:
        problems.append(f"{len(paragraphs)} paragraphs, at most {max_paragraphs} were asked for")

    problems.extend(_language_problems(stripped, lang, impersonal_ok=impersonal_ok))

    if "!" in stripped:
        problems.append("exclamation marks are not used in the reading")

    if MARKDOWN.search(stripped):
        problems.append("markdown headings or bullets — plain paragraphs only")

    without_allowed = ALLOWED_TAGS.sub("", stripped)
    stray = ANY_TAG.findall(without_allowed)
    if stray:
        problems.append(f"unsupported markup: {', '.join(sorted(set(stray))[:3])}")

    return Report(tuple(problems))
