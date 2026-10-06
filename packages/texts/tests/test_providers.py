"""What the provider sends and what it reports, checked without leaving the process."""

from typing import Any

import httpx
import pytest
from natalka_texts.providers import OPENROUTER_DIRECT, OpenRouterProvider

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
