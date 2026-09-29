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
        "не просто",
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


def check(text: str, *, lang: str, min_paragraphs: int, max_paragraphs: int) -> Report:
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

    for phrase in _found(stripped, IMPLIES_KNOWLEDGE.get(lang, ())):
        problems.append(f'"{phrase}" implies we know something the chart cannot tell us')
    for phrase in _found(stripped, CLICHES.get(lang, ())):
        problems.append(f'"{phrase}" is on the banned list in the style guide')

    if "!" in stripped:
        problems.append("exclamation marks are not used in the reading")

    if MARKDOWN.search(stripped):
        problems.append("markdown headings or bullets — plain paragraphs only")

    without_allowed = ALLOWED_TAGS.sub("", stripped)
    stray = ANY_TAG.findall(without_allowed)
    if stray:
        problems.append(f"unsupported markup: {', '.join(sorted(set(stray))[:3])}")

    return Report(tuple(problems))
