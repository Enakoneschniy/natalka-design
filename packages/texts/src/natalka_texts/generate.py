"""Write a reading, section by section.

One request per section rather than one for the whole document: a thirty-page answer loses its
structure halfway through, a rejected section can be retried on its own, and the cost of a retry
stays proportional to the section rather than the document.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .facts import fact_sheet, horoscope_sheet
from .prompts import repair_prompt, section_prompt, system_prompt
from .providers import Completion, ModelUnavailableError, Provider
from .sections import HOROSCOPE, SectionSpec, specs, title
from .validate import check

log = logging.getLogger(__name__)

#: Six paragraphs of Russian prose run to about 1 500 tokens; the rest is headroom so an answer is
#: never cut mid-sentence, which used to cost a whole retry.
MAX_TOKENS = 8000


@dataclass(slots=True)
class SectionText:
    id: str
    title: str
    text: str
    quote: bool = False
    problems: tuple[str, ...] = ()
    attempts: int = 1


@dataclass(slots=True)
class Reading:
    lang: str
    sections: list[SectionText] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    cost_micros: int = 0
    model: str = ""

    def by_id(self) -> dict[str, SectionText]:
        return {s.id: s for s in self.sections}

    @property
    def rejected(self) -> list[SectionText]:
        """Sections that still had problems after the retry — worth a look before selling them."""
        return [s for s in self.sections if s.problems]

    def _record(self, completion: Completion) -> None:
        self.tokens_in += completion.tokens_in
        self.tokens_out += completion.tokens_out
        self.cost_micros += completion.cost_micros
        self.model = completion.model


def _one_section(
    provider: Provider,
    spec: SectionSpec,
    *,
    system: str,
    user: str,
    lang: str,
    reading: Reading,
) -> SectionText:
    completion = provider.complete(system, user, max_tokens=MAX_TOKENS)
    reading._record(completion)
    report = check(
        completion.text,
        lang=lang,
        min_paragraphs=spec.paragraphs[0],
        max_paragraphs=spec.paragraphs[1],
        impersonal_ok=spec.impersonal_ok,
    )
    if report.ok:
        return SectionText(spec.id, title(spec, lang), completion.text, quote=spec.quote)

    # Codes only: the problems quote the draft, and the draft can carry the person's name.
    log.info("section %s rejected: %s", spec.id, ", ".join(report.codes))
    retry = provider.complete(
        system, f"{user}\n\n{repair_prompt(list(report.problems))}", max_tokens=MAX_TOKENS
    )
    reading._record(retry)
    second = check(
        retry.text,
        lang=lang,
        min_paragraphs=spec.paragraphs[0],
        max_paragraphs=spec.paragraphs[1],
        impersonal_ok=spec.impersonal_ok,
    )
    # The second draft is used even when imperfect: it is the better of the two in practice, and a
    # missing section is worse than a clumsy one. `Reading.rejected` keeps the receipt.
    return SectionText(
        spec.id,
        title(spec, lang),
        retry.text,
        quote=spec.quote,
        problems=second.problems,
        attempts=2,
    )


def write_reading(
    facts: dict[str, Any],
    *,
    provider: Provider,
    product: str = "natal",
    lang: str = "uk",
    name: str,
    gender: str = "n",
    transits: list[dict[str, Any]] | None = None,
) -> Reading:
    natal_sheet = fact_sheet(facts, None)
    transit_sheet = fact_sheet(facts, transits) if transits else natal_sheet
    system = system_prompt(lang, gender, product)
    unknown_time = bool(facts["birth"]["unknown_time"])
    reading = Reading(lang=lang)

    # Each section is told what came before it, by title, so the document does not repeat itself.
    written: list[str] = []
    for spec in specs(product, unknown_time=unknown_time):
        sheet = transit_sheet if spec.needs_transits else natal_sheet
        user = section_prompt(spec, name=name, sheet=sheet, written_so_far=written)
        try:
            section = _one_section(
                provider, spec, system=system, user=user, lang=lang, reading=reading
            )
        except ModelUnavailableError:
            raise
        reading.sections.append(section)
        written.append(f"{title(spec, lang)}: {section.text[:160]}…")
    return reading


def write_horoscope(
    facts: dict[str, Any],
    *,
    provider: Provider,
    sky: list[dict[str, Any]],
    transits: list[dict[str, Any]],
    period: str = "week",
    start: str,
    end: str,
    lang: str = "uk",
    name: str = "",
    gender: str = "n",
) -> Reading:
    """One window, one model call (two if the editor rejects the first).

    A horoscope is short enough to write in one piece, so it does not go through the section loop:
    splitting four paragraphs into four requests would pay for the fact sheet four times over.
    """
    spec = HOROSCOPE[period]
    sheet = horoscope_sheet(facts, sky=sky, transits=transits, period=period, start=start, end=end)
    system = system_prompt(lang, gender, "horoscope")
    user = section_prompt(spec, name=name, sheet=sheet, written_so_far=[])
    reading = Reading(lang=lang)
    reading.sections.append(
        _one_section(provider, spec, system=system, user=user, lang=lang, reading=reading)
    )
    return reading
