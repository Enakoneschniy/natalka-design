import re

import pytest
from natalka_texts import ScriptedProvider, write_reading
from natalka_texts.providers import Completion, ModelUnavailableError, OpenRouterProvider
from natalka_texts.sections import specs

GOOD = "Перший абзац розбору.\n\nДругий абзац розбору.\n\nТретій абзац розбору.\n\nЧетвертий."


class SizedProvider:
    """Answers with as many paragraphs as the section asked for.

    Sections range from one paragraph to six, so a fixed answer can never satisfy all of them —
    this double reads the requested length back out of the prompt, the way a model would.
    """

    def __init__(self, *, first: str | None = None) -> None:
        self.first = first
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        self.calls.append((system, user))
        if self.first is not None and len(self.calls) == 1:
            text, self.first = self.first, None
            return Completion(text=text, tokens_in=0, tokens_out=0, model="scripted")
        wanted = int(re.search(r"Length: (\d+)", user).group(1))
        body = "\n\n".join(f"Абзац номер {i + 1} цього розділу." for i in range(wanted))
        return Completion(text=body, tokens_in=0, tokens_out=0, model="scripted")


def test_a_reading_covers_every_section(facts: dict) -> None:
    reading = write_reading(facts, provider=SizedProvider(), name="Оксана", lang="uk")
    assert [s.id for s in reading.sections] == [s.id for s in specs("natal", unknown_time=False)]
    assert not reading.rejected


def test_sections_needing_houses_are_dropped_without_a_birth_time(facts_no_time: dict) -> None:
    reading = write_reading(facts_no_time, provider=SizedProvider(), name="Оксана")
    ids = {s.id for s in reading.sections}
    assert "natal.ascendant" not in ids
    assert "natal.sun" in ids


def test_a_bad_draft_is_regenerated_once(facts: dict) -> None:
    # First answer breaks two rules, the second is clean; the clean one is what ends up in the doc.
    provider = SizedProvider(first="Давайте рассмотрим вашу карту!")
    reading = write_reading(facts, provider=provider, name="Оксана", lang="ru")
    first = reading.sections[0]
    assert first.attempts == 2
    assert "Давайте" not in first.text
    assert not reading.rejected


def test_a_draft_that_stays_bad_is_kept_but_flagged(facts: dict) -> None:
    provider = ScriptedProvider("Подводя итог!")
    reading = write_reading(facts, provider=provider, name="Оксана", lang="ru")
    assert reading.rejected
    assert reading.sections[0].problems


def test_the_prompt_never_leaks_more_than_the_chart(facts: dict) -> None:
    provider = SizedProvider()
    write_reading(facts, provider=provider, name="Оксана", lang="uk", gender="f")
    system, user = provider.calls[0]
    assert "Оксана" in user
    assert "жіночому роді" in system
    # The exact place is deliberately absent: the model gets coordinates, not an address.
    assert "Yevpatoriya" not in user


def test_cost_is_derived_from_the_model_price_list() -> None:
    completion = Completion(
        text="x", tokens_in=1_000_000, tokens_out=1_000_000, model="anthropic/claude-sonnet-5"
    )
    assert completion.cost_micros == 12_000_000  # $2 in + $10 out
    assert Completion("x", 10, 10, "unknown-model").cost_micros == 0


def test_a_reported_cost_beats_the_price_list() -> None:
    completion = Completion(
        text="x",
        tokens_in=10,
        tokens_out=10,
        model="anthropic/claude-sonnet-5",
        reported_cost_micros=4242,
    )
    assert completion.cost_micros == 4242


def test_a_missing_key_is_a_retryable_error() -> None:
    provider = OpenRouterProvider(api_key="")
    with pytest.raises(ModelUnavailableError):
        provider.complete("system", "user", max_tokens=16)


def test_only_forecast_sections_carry_the_transit_list(facts: dict) -> None:
    provider = SizedProvider()
    transits = [{"date": "2026-06-09", "kind": "ingress", "body": "jupiter", "target": "cancer"}]
    write_reading(facts, provider=provider, name="Оксана", lang="uk", transits=transits)
    prompts = {u for _, u in provider.calls}
    with_transits = [p for p in prompts if "TRANSITS (exact dates" in p]
    # Seven sections forecast something; the other twenty are not charged for the dates.
    assert len(with_transits) == 7
