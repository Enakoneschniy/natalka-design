"""What the provider sends and what it reports, checked without leaving the process."""

from typing import Any

import httpx
import pytest
from natalka_texts.providers import OPENROUTER_DIRECT, ModelUnavailableError, OpenRouterProvider

GATEWAY = "https://gateway.ai.cloudflare.com/v1/account/natalka/openrouter"
ANSWER = {
    "choices": [{"message": {"content": "Текст."}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 1, "completion_tokens": 1},
    "model": "scripted",
}


class Wire:
    """Stands in for httpx.post: records each request and answers with ``status`` and ``body``."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.body: Any = ANSWER

    def __call__(self, url: str, **kw: Any) -> httpx.Response:
        request = httpx.Request("POST", url, headers=kw["headers"], json=kw["json"])
        self.requests.append(request)
        return httpx.Response(self.status, json=self.body, request=request)


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch) -> Wire:
    for name in ("NATALKA_AI_GATEWAY_URL", "NATALKA_AI_GATEWAY_TOKEN", "NATALKA_MODEL"):
        monkeypatch.delenv(name, raising=False)
    fake = Wire()
    monkeypatch.setattr(httpx, "post", fake)
    return fake


def test_the_gateway_token_goes_to_the_gateway(wire: Wire, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATALKA_AI_GATEWAY_URL", GATEWAY)
    monkeypatch.setenv("NATALKA_AI_GATEWAY_TOKEN", "gw-token")
    OpenRouterProvider(api_key="model-key").complete("s", "u")
    headers = wire.requests[0].headers
    assert str(wire.requests[0].url).startswith(GATEWAY)
    assert headers["cf-aig-authorization"] == "Bearer gw-token"
    assert headers["authorization"] == "Bearer model-key"


def test_without_a_token_the_request_is_as_before(wire: Wire) -> None:
    OpenRouterProvider(api_key="model-key", base_url=GATEWAY).complete("s", "u")
    assert "cf-aig-authorization" not in wire.requests[0].headers


def test_the_gateway_token_never_goes_anywhere_else(wire: Wire) -> None:
    for base_url in (OPENROUTER_DIRECT, "https://gateway.ai.cloudflare.com.example/v1/x"):
        OpenRouterProvider(api_key="k", base_url=base_url, gateway_token="gw-token").complete(
            "s", "u"
        )
    assert not [r for r in wire.requests if "cf-aig-authorization" in r.headers]


def _failure() -> str:
    with pytest.raises(ModelUnavailableError) as caught:
        OpenRouterProvider(api_key="k").complete("s", "u")
    return str(caught.value)


#: What a moderation refusal can look like: it quotes the request back.
QUOTING = {"error": {"code": 403, "metadata": {"flagged_input": "Оксана, 15.05.1994"}}}


def test_a_refused_call_is_reported_by_its_status_alone(wire: Wire) -> None:
    wire.status, wire.body = 403, QUOTING
    assert _failure() == "the provider answered 403"


def test_an_error_inside_an_answer_is_reported_without_its_text(wire: Wire) -> None:
    wire.body = QUOTING
    assert _failure() == "the provider reported an error (403)"
    wire.body = {"error": "Оксана"}
    assert _failure() == "the provider reported an error"


def test_an_answer_that_is_not_json_is_a_failed_call(
    wire: Wire, monkeypatch: pytest.MonkeyPatch
) -> None:
    def garbled(url: str, **kw: Any) -> httpx.Response:
        return httpx.Response(200, text="<html>Оксана</html>", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", garbled)
    assert _failure() == "the provider answered with something other than JSON"


def test_a_network_failure_is_named_by_its_kind(
    wire: Wire, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unreachable(url: str, **kw: Any) -> httpx.Response:
        raise httpx.ConnectError(f"cannot reach {url} for Оксана")

    monkeypatch.setattr(httpx, "post", unreachable)
    assert _failure() == "the provider could not be reached (ConnectError)"
