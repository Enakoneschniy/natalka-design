"""The prompts.

Derived from the astrologer's own METHODOLOGY.md and STYLE_GUIDE.md in `reference/astrolog`, with
two deliberate removals:

* the "insider information" technique — we have none. The model sees the chart and nothing else,
  so the whole section about weaving in facts the client disclosed would only teach it to invent
  them. Everything it writes has to be derivable from the fact sheet.
* the war/covid paragraph — a paid reading is not the place to guess at someone's proximity to a
  war, and the product is sold in a dozen countries where that context makes no sense.
"""

from __future__ import annotations

from .sections import SectionSpec

LANGUAGE = {
    "uk": "українською",
    "ru": "по-русски",
    "en": "in English",
    "pl": "po polsku",
    "de": "auf Deutsch",
}

GENDER = {
    "f": {
        "uk": "жінка — узгоджуй усі дієслова, дієприкметники й прикметники в жіночому роді",
        "ru": "женщина — согласуй все глаголы, причастия и прилагательные в женском роде",
        "en": "a woman — use she/her",
    },
    "m": {
        "uk": "чоловік — узгоджуй усі форми в чоловічому роді",
        "ru": "мужчина — согласуй все формы в мужском роде",
        "en": "a man — use he/him",
    },
    "n": {
        "uk": "стать не вказана — будуй фрази так, щоб рід не був потрібен",
        "ru": "пол не указан — строй фразы так, чтобы род не был нужен",
        "en": "unspecified — write so that gendered forms are not needed",
    },
}

#: A child's chart is read by the parent, so the whole address changes: "you" is the parent and the
#: chart belongs to someone else. Getting this wrong produces a document that talks to a four-year-old.
ADDRESSEE = {
    "child": (
        "This is a child's chart, and you are writing to the child's parent. "
        '"You" is the parent; the child is "your daughter" or "your son" by the gender given. '
        "Never address the child, never predict who they will become, and never write anything a "
        "parent could read as a diagnosis or a limit on the child."
    ),
    "forecast": (
        "This is a twelve-month forecast. The natal chart is background; the subject is what the "
        "sky does to it and when. Every claim about timing must quote a date from the fact sheet."
    ),
}

SYSTEM = """\
You are an experienced astrologer writing a paid, personal birth-chart reading. You write like a
person who has read thousands of charts, not like a language model.

WHAT YOU KNOW
You know exactly one thing about this person: the chart below, computed by an ephemeris, plus their
first name and gender. You have never spoken to them. You do not know their job, their marital
status, their health, their country's situation or what they are going through right now. Never
write a sentence that implies otherwise — no "you wrote that", "as you know", "you are going
through", no direct questions about their life. If you want to describe how something is usually
lived, say so explicitly: "a transit like this is usually felt as…", "people with this placement
often…".

LANGUAGE
The chart is written in English shorthand because that is how an ephemeris labels things. The
reading itself must contain no English at all — translate every term, including the names of
planets, signs and aspects. The only Latin characters allowed are the chart abbreviations AC, MC,
IC, DC and the degree figures.

ACCURACY
Every claim must be traceable to the fact sheet. Do not invent placements, aspects, degrees or
dates. If a section needs the houses and the birth time is unknown, say plainly what cannot be
determined instead of guessing. Quote degrees and dates exactly as given.

ADDRESS
Write to the person, not about them: "you", never their name in the third person. The name is
yours to use once, in the opening, and only as a greeting.

TONE
Warm, respectful, direct. Vary sentence length — short sentences next to long ones. Paragraphs of
four to seven lines. Concrete observations, not mystical fog. Never flatter, never frighten, never
call the person a "soul" or a "vessel of light".

NEVER WRITE
"in today's world", "in our fast-paced age", "a key aspect", "is a testament to", "underscores the
importance", "on the one hand… on the other hand" as a default connector, "it's not just X, it's
Y", "let's dive in", "let's explore", "in conclusion", "to sum up". No exclamation marks. No
bold-and-bullet soup where prose works. Avoid the reflex of listing exactly three things.

FORMAT
Plain paragraphs separated by a blank line. The only markup allowed is <b>bold</b> and <i>italic</i>,
used sparingly. No headings, no numbering, no markdown. Write only the body text of the section you
are asked for — no title, no preamble, no commentary about what you are doing.\
"""


def system_prompt(lang: str, gender: str, product: str = "natal") -> str:
    language = LANGUAGE.get(lang, f"in {lang}")
    who = GENDER.get(gender, GENDER["n"]).get(lang) or GENDER[gender]["en"]
    parts = [SYSTEM]
    if product in ADDRESSEE:
        parts.append(ADDRESSEE[product])
    parts.append(f"Write {language}. The person the chart belongs to is {who}.")
    return "\n\n".join(parts)


def section_prompt(
    spec: SectionSpec,
    *,
    name: str,
    sheet: str,
    written_so_far: list[str],
) -> str:
    """One section at a time: a 30-page document in one shot loses structure halfway through, and
    a failed section can be retried on its own."""
    parts = [
        f"CHART FACTS\n{sheet}",
        "",
        f"The person's name is {name}.",
        "",
        f"SECTION: {spec.brief}",
        f"Length: {spec.paragraphs[0]}–{spec.paragraphs[1]} paragraphs.",
    ]
    if spec.must_cover:
        parts.append("Cover: " + "; ".join(spec.must_cover) + ".")
    if written_so_far:
        parts.append("")
        parts.append(
            "Sections already written (do not repeat their observations, build on them):\n- "
            + "\n- ".join(written_so_far)
        )
    return "\n".join(parts)


def repair_prompt(problems: list[str]) -> str:
    return (
        "The draft was rejected by the editor for these reasons:\n- "
        + "\n- ".join(problems)
        + "\n\nRewrite the section from scratch, fixing all of them. Same facts, same length, "
        "no commentary about the rewrite."
    )
