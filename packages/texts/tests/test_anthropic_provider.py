"""The direct route to Anthropic, and the backup behind it, checked without leaving the process."""

import functools
import json
from typing import Any

import anthropic
import httpx2
import pytest
from natalka_texts.providers import (
    AnthropicProvider,
    Completion,
    FallbackProvider,
    ModelUnavailableError,
    OpenRouterProvider,
    ScriptedProvider,
    default_provider,
)

GATEWAY = "https://gateway.ai.cloudflare.com/v1/account/natalka/anthropic"


def message(text: str = "Текст.", stop: str = "end_turn") -> dict[str, Any]:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5",
        "content": [{"type": "text", "text": text}] if text else [],
        "stop_reason": stop,
        "stop_sequence": None,
        "usage": {"input_tokens": 1000, "output_tokens": 500},
    }


class Wire:
    """Stands in for Anthropic: records each request and answers with ``status`` and ``body``."""

    def __init__(self) -> None:
        self.requests: list[httpx2.Request] = []
        self.status = 200
        self.body: Any = message()

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        return httpx2.Response(self.status, json=self.body)

    def sent(self) -> dict[str, Any]:
        return json.loads(self.requests[-1].content)


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch) -> Wire:
    for name in (
        "ANTHROPIC_API_KEY",
        "NATALKA_ANTHROPIC_BASE_URL",
        "NATALKA_AI_GATEWAY_TOKEN",
        "NATALKA_MODEL",
        "NATALKA_MODEL_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    fake = Wire()
    client = functools.partial(
        anthropic.Anthropic,
        http_client=httpx2.Client(transport=httpx2.MockTransport(fake)),
        max_retries=0,
    )
    monkeypatch.setattr(anthropic, "Anthropic", client)
    return fake


def test_the_request_is_the_one_openrouter_was_sent(wire: Wire) -> None:
    done = AnthropicProvider(api_key="k").complete("system", "user", max_tokens=8000)
    assert wire.sent() == {
        "model": "claude-sonnet-5",
        "max_tokens": 8000,
        "system": "system",
        "messages": [{"role": "user", "content": "user"}],
        "thinking": {"type": "disabled"},
    }
    assert wire.requests[0].headers["authorization"] == "Bearer k"
    assert done == Completion(
        text="Текст.", tokens_in=1000, tokens_out=500, model="claude-sonnet-5"
    )
    # Anthropic reports no cost; the price list gives $2 in and $10 out per million tokens.
    assert done.cost_micros == 7000


def test_the_gateway_token_goes_to_the_gateway_and_nowhere_else(
    wire: Wire, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("NATALKA_ANTHROPIC_BASE_URL", GATEWAY)
    monkeypatch.setenv("NATALKA_AI_GATEWAY_TOKEN", "gw-token")
    AnthropicProvider(api_key="k").complete("s", "u")
    assert str(wire.requests[0].url) == f"{GATEWAY}/v1/messages"
    assert wire.requests[0].headers["cf-aig-authorization"] == "Bearer gw-token"
    AnthropicProvider(api_key="k", base_url="https://api.anthropic.com").complete("s", "u")
    assert "cf-aig-authorization" not in wire.requests[1].headers


def test_a_model_named_the_openrouter_way_is_asked_for_by_anthropics_name(
    wire: Wire, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("NATALKA_MODEL", "anthropic/claude-haiku-4.5")
    AnthropicProvider(api_key="k").complete("s", "u")
    assert wire.sent()["model"] == "claude-haiku-4-5"


def _failure(**kw: Any) -> str:
    with pytest.raises(ModelUnavailableError) as caught:
        AnthropicProvider(**kw).complete("s", "u")
    return str(caught.value)


def test_without_a_key_nothing_is_sent(wire: Wire) -> None:
    assert _failure() == "ANTHROPIC_API_KEY is not set"
    assert wire.requests == []


def test_a_refused_call_is_reported_by_its_status_alone(wire: Wire) -> None:
    wire.status = 400
    wire.body = {
        "type": "error",
        "error": {"type": "invalid_request_error", "message": "Оксана, 15.05.1994"},
    }
    assert _failure(api_key="k") == "the provider answered 400"


def test_an_unusable_answer_is_a_failed_call(wire: Wire) -> None:
    wire.body = message(stop="max_tokens")
    assert _failure(api_key="k") == "the answer was cut off at max_tokens"
    wire.body = message(text="")
    assert _failure(api_key="k") == "the model returned no text"
    wire.body = message(text="", stop="refusal")
    assert _failure(api_key="k") == "the model declined to write this section"


class Down:
    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        raise ModelUnavailableError("the provider answered 400")


def test_the_backup_answers_when_the_first_cannot() -> None:
    backup = ScriptedProvider("Запасной текст.")
    done = FallbackProvider(Down(), backup).complete("s", "u", max_tokens=10)
    assert done.text == "Запасной текст."
    assert backup.calls == [("s", "u")]


def test_the_backup_is_not_asked_when_the_first_answers() -> None:
    backup = ScriptedProvider("Запасной текст.")
    done = FallbackProvider(ScriptedProvider("Текст."), backup).complete("s", "u")
    assert done.text == "Текст."
    assert backup.calls == []


def test_a_failure_of_both_is_the_backups_to_report() -> None:
    with pytest.raises(ModelUnavailableError):
        FallbackProvider(Down(), Down()).complete("s", "u")


def test_the_route_follows_the_keys_that_are_set(
    wire: Wire, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert isinstance(default_provider(), OpenRouterProvider)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "a")
    assert isinstance(default_provider(), AnthropicProvider)
    monkeypatch.setenv("NATALKA_MODEL_API_KEY", "o")
    chosen = default_provider()
    assert isinstance(chosen, FallbackProvider)
    assert isinstance(chosen.first, AnthropicProvider)
    assert isinstance(chosen.second, OpenRouterProvider)
