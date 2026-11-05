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

from .address import Address

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
        "ты писал",
        "ты говорил",
        "как ты знаешь",
        "как ты сам",
        "ты упомянул",
        "из твоего письма",
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
        "ти писав",
        "ти писала",
        "ти казав",
        "ти казала",
        "як ти знаєш",
        "як ти сам",
        "ти згадував",
        "ти згадувала",
        "з твого листа",
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
    "de": (
        "sie schrieben",
        "sie haben geschrieben",
        "sie erzählten",
        "sie haben erzählt",
        "sie erwähnten",
        "sie haben erwähnt",
        "wie sie wissen",
        "wie sie selbst",
        "wie sie sagten",
        "sie gehen gerade durch",
        "in ihrer nachricht",
        "aus ihrem brief",
        "du hast geschrieben",
        "wie du weißt",
    ),
    "pl": (
        "pisała pani",
        "pisał pan",
        "jak pani wie",
        "jak pan wie",
        "wspomniała pani",
        "wspomniał pan",
        "z pani listu",
        "z pana listu",
        "jak sama pani",
        "jak sam pan",
        "przechodzi pani teraz",
        "przechodzi pan teraz",
        "pisałaś",
        "pisałeś",
        "jak wiesz",
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
    "de": (
        "in der heutigen welt",
        "in unserer schnelllebigen zeit",
        "ein schlüsselaspekt",
        "ist ein zeugnis",
        "zeugt davon",
        "unterstreicht die bedeutung",
        "lassen sie uns eintauchen",
        "tauchen wir ein",
        "lassen sie uns betrachten",
        "abschließend lässt sich",
        "zusammenfassend lässt sich",
        "es ist erwähnenswert",
        "es ist wichtig zu verstehen",
        "es sei darauf hingewiesen",
    ),
    "pl": (
        "w dzisiejszym świecie",
        "w dzisiejszych czasach",
        "kluczowy aspekt",
        "jest świadectwem",
        "podkreśla znaczenie",
        "zanurzmy się",
        "przyjrzyjmy się",
        "podsumowując",
        "na zakończenie",
        "warto zauważyć",
        "warto podkreślić",
        "należy zaznaczyć",
        "ważne jest, aby zrozumieć",
    ),
}

#: The reading is written on formal terms. A model that slips into «ты» has not made a stylistic
#: choice — it has changed the relationship, in a document someone paid for.
#:
#: Matched on word boundaries, not as substrings: "робити" ends in "ти" and "основы" ends in "вы",
#: and a plain `in` check turns both into false accusations.
INFORMAL = {
    "ru": re.compile(r"\b(ты|теб[яе]|тобой|тво[йяёеи]\w*)\b", re.IGNORECASE),
    # «твій» and every form of it — «твого», «твому», «твою», «твоя», «твоє…», «твої…» — but not
    # «творчість» or «твори».
    "uk": re.compile(
        r"\b(ти|тоб[іи]|тебе|тобою|тві[йм]|тво(?:го|му|я|ю|[їєё]\w*))\b", re.IGNORECASE
    ),
    "de": re.compile(r"\b(du|dich|dir|dein\w*)\b", re.IGNORECASE),
    # Not «ci»: it is also "those" («ci ludzie»).
    "pl": re.compile(r"\b(ty|ciebie|cię|tobie|tobą|twój|twoj\w+)\b", re.IGNORECASE),
}

#: A section written *about* the reader instead of *to* them reads like a horoscope column and
#: slips into the wrong gender. Any real section of a reading addresses them at least once.
SECOND_PERSON = {
    "ru": re.compile(r"\b(вы|вас|вам|вами|ваш\w*)\b", re.IGNORECASE),
    "uk": re.compile(r"\b(ви|вас|вам|вами|ваш\w*)\b", re.IGNORECASE),
    "en": re.compile(r"\b(you|your|yours)\b", re.IGNORECASE),
    # Case matters here and only here: «sie» and «ihr» in lower case are "she", "they" and "her".
    # At the start of a sentence the capital says nothing, so only a «Sie», «Ihnen» or «Ihr…»
    # inside a sentence — after a lower-case word or a comma — counts as speaking to the reader.
    "de": re.compile(r"(?<=[a-zäöüß,;:–—] )(Sie|Ihnen|Ihr\w*)\b"),
    # The formal title, capitalised as in a letter; lower-case «pani» is just "a lady".
    "pl": re.compile(r"\b(Pani|Pan|Pana|Panu|Panem|Panią|Państw\w*)\b"),
}

#: The two forms of address by name, for the problems the model is given back.
ADDRESS_NAMES = {"de": ("«Sie»", "«du»"), "pl": ("«Pani» / «Pan»", "«ty»")}
DEFAULT_ADDRESS_NAMES = ("«вы»", "«ты»")

#: Two people addressed together on informal terms. In Russian and Ukrainian that is the formal
#: plural; German has its own: «ihr», «euch», «euer».
INFORMAL_PLURAL = {
    "de": re.compile(r"\b(ihr|euch|euer\w*)\b", re.IGNORECASE),
    "pl": re.compile(r"\b(wy|was|wam|wami|wasz\w*)\b", re.IGNORECASE),
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


def _latin(ch: str) -> bool:
    return ch.isascii() or "\u00aa" <= ch <= "\u024f" or "\u1e00" <= ch <= "\u1eff"


def _cyrillic(ch: str) -> bool:
    return "\u0400" <= ch <= "\u052f"


def _foreign_script(text: str, lang: str) -> list[str]:
    """Letters of a script the reading is not written in: a Chinese character in the middle of a
    Russian sentence («меньше半 градуса»), Greek, Arabic. A model slips into one now and then, and
    no reader can read it. Latin in a Cyrillic reading has its own, finer check above."""
    cyrillic_ok = lang in CYRILLIC_LANGS
    return sorted(
        {
            ch
            for ch in text
            if ch.isalpha() and not _latin(ch) and not (cyrillic_ok and _cyrillic(ch))
        }
    )


#: A section that opens like a letter. Only the opening section may greet: every other one is
#: written on its own and tends to take itself for the start, so a reading greets its reader at
#: every chapter.
GREETING = {
    "de": re.compile(r"^(Liebe|Lieber|Hallo|Guten Tag)\b[^\n.,!]{0,40}[,!]"),
    "ru": re.compile(r"^(Дорогая|Дорогой|Здравствуйте|Привет)\b[^\n.,!]{0,40}[,!]"),
    "uk": re.compile(r"^(Дорога|Дорогий|Вітаю|Привіт)\b[^\n.,!]{0,40}[,!]"),
    "en": re.compile(r"^(Dear|Hello|Hi)\b[^\n.,!]{0,40}[,!]"),
    "pl": re.compile(
        r"^(Droga|Drogi|Szanowna|Szanowny|Dzień dobry|Witam|Witaj)\b[^\n.,!]{0,40}[,!]"
    ),
}

#: A German sign without its article — «in Stier» for «im Stier», «in Jungfrau» for «in der
#: Jungfrau». The model slips into it under the English "in Taurus".
SIGN_WITHOUT_ARTICLE = re.compile(
    r"\bin (Widder|Stier|Zwillingen?|Krebs|Löwen?|Jungfrau|Waage|Skorpion|Schützen?|Steinbock|"
    r"Wassermann|Fischen?)\b"
)

#: English words a German reading slips in, alone or inside a compound («Timing-Wissen»).
ANGLICISMS = re.compile(
    r"\b(Timing|Mindset|Challenge|Commitment|Self-?Care|Lifestyle|Workflow|Feedback|Setting|Struggle|Chart)",
    re.IGNORECASE,
)

#: Only these survive into the PDF; anything else means the model ignored the format rules.
ALLOWED_TAGS = re.compile(r"</?(b|i|br\s*/?)>", re.IGNORECASE)
ANY_TAG = re.compile(r"<[^>]+>")
MARKDOWN = re.compile(r"^\s{0,3}(#{1,6}\s|\*\s|-\s|\d+\.\s)", re.MULTILINE)


@dataclass(frozen=True, slots=True)
class Report:
    #: What is wrong, in words the model is given back. These quote the draft.
    problems: tuple[str, ...]
    #: One code per problem, in the same order: what a log line may say about a draft, since the
    #: draft can carry the person's name.
    codes: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.problems


#: A problem as a check finds it: its code, then its description.
_Problem = tuple[str, str]


def _found(text: str, needles: tuple[str, ...]) -> list[str]:
    low = text.lower()
    return [n for n in needles if n in low]


def _address_problems(
    text: str, lang: str, *, impersonal_ok: bool, address: Address, pair: bool, gender: str
) -> list[_Problem]:
    """The form of address: «вы» / «Sie» by default, «ты» / «du» when the seller asked for it."""
    problems: list[_Problem] = []
    formal_name, informal_name = ADDRESS_NAMES.get(lang, DEFAULT_ADDRESS_NAMES)
    informal_re = INFORMAL.get(lang)
    informal = informal_re.search(text) if informal_re else None
    if informal and address == "vy":
        problems.append(
            (
                "informal_address",
                f"addresses the reader informally ({informal.group(0)}); "
                f"the reading is on {formal_name}",
            )
        )

    # A Polish reader whose gender is not given has no title to be addressed by — «Pani» and «Pan»
    # are a woman's and a man's — so their reading is written impersonally, by design.
    impersonal_by_design = lang == "pl" and address == "vy" and gender not in ("f", "m")
    if not impersonal_ok and not impersonal_by_design and len(text) > ADDRESS_MIN_CHARS:
        if address == "ty" and informal_re:
            plural = INFORMAL_PLURAL.get(lang) or SECOND_PERSON.get(lang)
            if not informal and not (pair and plural and plural.search(text)):
                problems.append(
                    (
                        "not_addressed",
                        "the section talks about the reader instead of addressing them as "
                        f"{informal_name}",
                    )
                )
        else:
            formal = SECOND_PERSON.get(lang)
            if formal and not formal.search(text) and not informal:
                problems.append(
                    (
                        "not_addressed",
                        "the section talks about the reader instead of addressing them",
                    )
                )
    return problems


def _style_problems(text: str, lang: str, *, impersonal_ok: bool) -> list[_Problem]:
    """A greeting at the head of a chapter, and the slips of the Latin-script languages: English
    words, and a German sign without its article."""
    problems: list[_Problem] = []
    greeting = GREETING.get(lang)
    if greeting and not impersonal_ok and greeting.search(text):
        problems.append(
            ("greeting", "the section opens with a greeting; only the opening section greets")
        )
    if lang in ("de", "pl"):
        english = sorted({m.group(0) for m in ANGLICISMS.finditer(text)})
        if english:
            problems.append(("anglicism", f"English words: {', '.join(english[:3])}"))
    if lang == "de":
        bare = sorted({m.group(0) for m in SIGN_WITHOUT_ARTICLE.finditer(text)})
        if bare:
            problems.append(
                (
                    "sign_article",
                    f"a sign without its article: {', '.join(bare[:3])} — write «im Stier», "
                    "«in der Jungfrau», «in den Zwillingen»",
                )
            )
    return problems


def _language_problems(
    text: str,
    lang: str,
    *,
    impersonal_ok: bool = False,
    address: Address = "vy",
    pair: bool = False,
    gender: str = "n",
) -> list[_Problem]:
    """Checks that only make sense for a given language: banned phrases, stray Latin, address."""
    problems: list[_Problem] = []
    for phrase in _found(text, IMPLIES_KNOWLEDGE.get(lang, ())):
        problems.append(
            ("implies_knowledge", f'"{phrase}" implies we know something the chart cannot tell us')
        )
    for phrase in _found(text, CLICHES.get(lang, ())):
        problems.append(("cliche", f'"{phrase}" is on the banned list in the style guide'))

    if lang in CYRILLIC_LANGS:
        mixed = MIXED_WORD.findall(text)
        if mixed:
            problems.append(
                (
                    "latin_in_word",
                    f"Latin letters inside a word: {', '.join(sorted(set(mixed))[:3])}",
                )
            )
        latin = [w for w in LATIN_WORD.findall(text) if w.lower() not in LATIN_OK]
        if latin:
            problems.append(
                ("latin_word", f"untranslated Latin words: {', '.join(sorted(set(latin))[:3])}")
            )

    problems.extend(_style_problems(text, lang, impersonal_ok=impersonal_ok))

    script = _foreign_script(text, lang)
    if script:
        problems.append(
            (
                "foreign_script",
                f"characters from another writing system: {' '.join(script[:5])} — "
                "every word must be in the language of the reading",
            )
        )

    letters = FOREIGN_LETTERS.get(lang)
    if letters:
        words = _foreign_words(text, letters)
        if words:
            problems.append(
                (
                    "other_language",
                    f"words from the other language: {', '.join(sorted(words)[:3])}",
                )
            )

    problems.extend(
        _address_problems(
            text, lang, impersonal_ok=impersonal_ok, address=address, pair=pair, gender=gender
        )
    )
    return problems


def check(
    text: str,
    *,
    lang: str,
    min_paragraphs: int,
    max_paragraphs: int,
    impersonal_ok: bool = False,
    address: Address = "vy",
    pair: bool = False,
    gender: str = "n",
) -> Report:
    problems: list[_Problem] = []

    stripped = text.strip()
    if not stripped:
        return Report(("the section is empty",), ("empty",))

    paragraphs = [p for p in re.split(r"\n\s*\n", stripped) if p.strip()]
    if len(paragraphs) < min_paragraphs:
        problems.append(
            (
                "too_few_paragraphs",
                f"only {len(paragraphs)} paragraphs, at least {min_paragraphs} were asked for",
            )
        )
    # One over is fine — the model often splits a long paragraph; two over means it ignored the brief.
    if len(paragraphs) > max_paragraphs + 1:
        problems.append(
            (
                "too_many_paragraphs",
                f"{len(paragraphs)} paragraphs, at most {max_paragraphs} were asked for",
            )
        )

    problems.extend(
        _language_problems(
            stripped, lang, impersonal_ok=impersonal_ok, address=address, pair=pair, gender=gender
        )
    )

    if "!" in stripped:
        problems.append(("exclamation", "exclamation marks are not used in the reading"))

    if MARKDOWN.search(stripped):
        problems.append(("markdown", "markdown headings or bullets — plain paragraphs only"))

    without_allowed = ALLOWED_TAGS.sub("", stripped)
    stray = ANY_TAG.findall(without_allowed)
    if stray:
        problems.append(("markup", f"unsupported markup: {', '.join(sorted(set(stray))[:3])}"))

    return Report(tuple(m for _, m in problems), tuple(c for c, _ in problems))
