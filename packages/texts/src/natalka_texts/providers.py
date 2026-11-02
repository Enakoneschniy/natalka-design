"""Model access.

Every call goes through Cloudflare AI Gateway: it gives per-request logs, token and cost figures
and retries without letting a second analytics vendor see birth data.

Behind the gateway there are two routes to the same Claude models, and one is used at a time.
Anthropic directly, on the owner's own API credits, when ANTHROPIC_API_KEY is set (since
2026-11-02); OpenRouter, which is what ran before, only when it is not. The owner chose not to
keep OpenRouter as a backup, so that the model provider named to buyers and sellers is one.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

import anthropic
import httpx

DEFAULT_MODEL = "anthropic/claude-sonnet-5"
OPENROUTER_DIRECT = "https://openrouter.ai/api"
ANTHROPIC_DIRECT = "https://api.anthropic.com"
#: Cloudflare AI Gateway. An authenticated gateway wants its own token beside the model key.
GATEWAY_HOST = "gateway.ai.cloudflare.com"

#: USD per million tokens, under OpenRouter's names and Anthropic's own. OpenRouter returns the
#: real cost of each generation in `usage`, and that is what we store — it includes their markup
#: and any cache discount; this table is what keeps the numbers sane if the field goes missing.
#: Anthropic reports no cost at all, so for its calls this table is the figure.
PRICES: dict[str, tuple[float, float]] = {
    "anthropic/claude-sonnet-5": (2.0, 10.0),
    "anthropic/claude-opus-5": (5.0, 25.0),
    "anthropic/claude-haiku-4.5": (1.0, 5.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-haiku-4-5": (1.0, 5.0),
}


class ModelUnavailableError(RuntimeError):
    """The provider refused or the key is missing — the job should be retried, not failed."""


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    tokens_in: int
    tokens_out: int
    model: str
    #: What the provider says this generation cost, in millionths of a USD. Zero means it did not
    #: say, and `cost_micros` falls back to the price list.
    reported_cost_micros: int = 0

    @property
    def cost_micros(self) -> int:
        """Cost in millionths of a USD, so a fraction of a cent is still an integer."""
        if self.reported_cost_micros:
            return self.reported_cost_micros
        prices = PRICES.get(self.model)
        if not prices:
            return 0
        usd = (self.tokens_in * prices[0] + self.tokens_out * prices[1]) / 1_000_000
        return round(usd * 1_000_000)


@runtime_checkable
class Provider(Protocol):
    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion: ...


class OpenRouterProvider:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 300.0,
        gateway_token: str | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("NATALKA_MODEL_API_KEY", "")
        self.base_url = (
            base_url or os.environ.get("NATALKA_AI_GATEWAY_URL") or OPENROUTER_DIRECT
        ).rstrip("/")
        self.model = model or os.environ.get("NATALKA_MODEL") or DEFAULT_MODEL
        self.timeout = timeout
        self.gateway_token = (
            gateway_token
            if gateway_token is not None
            else os.environ.get("NATALKA_AI_GATEWAY_TOKEN", "")
        )

    def _headers(self) -> dict[str, str]:
        headers = {
            "authorization": f"Bearer {self.api_key}",
            "content-type": "application/json",
            # OpenRouter attributes traffic by these; they show up in its dashboard.
            "http-referer": "https://chronika.me",
            "x-title": "Chronika",
        }
        # Only the gateway itself is given its token; OpenRouter, called directly, never sees it.
        url = httpx.URL(self.base_url)
        if self.gateway_token and url.scheme == "https" and url.host == GATEWAY_HOST:
            headers["cf-aig-authorization"] = f"Bearer {self.gateway_token}"
        return headers

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        if not self.api_key:
            raise ModelUnavailableError("NATALKA_MODEL_API_KEY is not set")
        try:
            response = httpx.post(
                f"{self.base_url}/v1/chat/completions",
                headers=self._headers(),
                json={
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    # Ask for the real cost of this call rather than deriving it from a price list.
                    "usage": {"include": True},
                    # No extended thinking: a section that spends its whole output budget on
                    # reasoning comes back with empty content, and we pay for the silence.
                    "reasoning": {"enabled": False},
                },
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:  # network, DNS, timeout
            raise ModelUnavailableError(
                f"the provider could not be reached ({type(exc).__name__})"
            ) from exc

        # A failure is described by its status, never by its text: an error body can quote the
        # request back — a name, a date — and this message travels on to the caller's logs.
        if response.status_code >= 400:
            raise ModelUnavailableError(f"the provider answered {response.status_code}")

        try:
            payload: dict[str, Any] = response.json()
        except ValueError as exc:
            raise ModelUnavailableError(
                "the provider answered with something other than JSON"
            ) from exc
        error = payload.get("error")
        if error:
            code = error.get("code") if isinstance(error, dict) else None
            suffix = f" ({code})" if isinstance(code, int) else ""
            raise ModelUnavailableError(f"the provider reported an error{suffix}")

        choices = payload.get("choices") or []
        if not choices:
            raise ModelUnavailableError("the provider returned no choices")
        choice = choices[0]
        text = (choice.get("message") or {}).get("content") or ""
        # An empty answer or one cut off at the ceiling is a failed call, not a bad draft: sending
        # it to the editor only buys a second, equally truncated attempt.
        if not text.strip():
            raise ModelUnavailableError("the model returned no text")
        if choice.get("finish_reason") == "length":
            raise ModelUnavailableError("the answer was cut off at max_tokens")

        usage = payload.get("usage") or {}
        cost = usage.get("cost")
        return Completion(
            text=text.strip(),
            tokens_in=int(usage.get("prompt_tokens", 0)),
            tokens_out=int(usage.get("completion_tokens", 0)),
            model=payload.get("model") or self.model,
            reported_cost_micros=round(float(cost) * 1_000_000) if cost else 0,
        )


def anthropic_model(name: str) -> str:
    """Anthropic's id for a model named the OpenRouter way: `anthropic/claude-haiku-4.5` is
    `claude-haiku-4-5` there. A name that is already Anthropic's comes back as it is."""
    return name.removeprefix("anthropic/").replace(".", "-")


class AnthropicProvider:
    """Claude through Anthropic's own API, billed to the owner's credits.

    The same model OpenRouter was asked for, and the same request: a system prompt, one user
    message, no extended thinking — a section that spends its output budget on reasoning comes
    back empty, and we pay for the silence.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 300.0,
        gateway_token: str | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.base_url = (
            base_url or os.environ.get("NATALKA_ANTHROPIC_BASE_URL") or ANTHROPIC_DIRECT
        ).rstrip("/")
        self.model = anthropic_model(model or os.environ.get("NATALKA_MODEL") or DEFAULT_MODEL)
        token = (
            gateway_token
            if gateway_token is not None
            else os.environ.get("NATALKA_AI_GATEWAY_TOKEN", "")
        )
        # The key travels as `x-api-key`. The SDK sends it as `Authorization: Bearer`, which
        # Anthropic accepts but the gateway's /anthropic route does not: it sees no key at all,
        # and every call is refused. So the bearer header is left out and the key named instead.
        self.headers: dict[str, str | anthropic.Omit] = {
            "x-api-key": self.api_key,
            "Authorization": anthropic.omit,
        }
        # Only the gateway itself is given its token; Anthropic, called directly, never sees it.
        url = httpx.URL(self.base_url)
        if token and url.scheme == "https" and url.host == GATEWAY_HOST:
            self.headers["cf-aig-authorization"] = f"Bearer {token}"
        # Without a key there is no client: the SDK would go looking for credentials elsewhere.
        self.client = (
            anthropic.Anthropic(api_key=self.api_key, base_url=self.base_url, timeout=timeout)
            if self.api_key
            else None
        )

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        if self.client is None:
            raise ModelUnavailableError("ANTHROPIC_API_KEY is not set")
        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                thinking={"type": "disabled"},
                extra_headers=self.headers,
            )
        # A failure is described by its status, never by its text: an error body can quote the
        # request back — a name, a date — and this message travels on to the caller's logs.
        except anthropic.APIStatusError as exc:
            raise ModelUnavailableError(f"the provider answered {exc.status_code}") from exc
        except anthropic.APIConnectionError as exc:  # network, DNS, timeout
            raise ModelUnavailableError(
                f"the provider could not be reached ({type(exc).__name__})"
            ) from exc

        text = "".join(block.text for block in message.content if block.type == "text")
        # As with OpenRouter: an empty answer, a refusal or one cut off at the ceiling is a failed
        # call, not a bad draft for the editor.
        if message.stop_reason == "refusal":
            raise ModelUnavailableError("the model declined to write this section")
        if not text.strip():
            raise ModelUnavailableError("the model returned no text")
        if message.stop_reason == "max_tokens":
            raise ModelUnavailableError("the answer was cut off at max_tokens")
        return Completion(
            text=text.strip(),
            tokens_in=message.usage.input_tokens,
            tokens_out=message.usage.output_tokens,
            model=message.model,
        )


def default_provider() -> Provider:
    """Anthropic directly when its key is set, and nothing behind it; OpenRouter otherwise, which
    is how the site ran before."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return AnthropicProvider()
    return OpenRouterProvider()


class ScriptedProvider:
    """Returns prepared text instead of calling a model.

    Two uses: tests, and running the whole pipeline end to end before a key is in place — the
    document comes out real, only the prose is a placeholder.
    """

    def __init__(self, text: str = "", *, per_section: list[str] | None = None) -> None:
        self.text = text
        self.queue = list(per_section or [])
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        self.calls.append((system, user))
        text = self.queue.pop(0) if self.queue else self.text
        return Completion(text=text, tokens_in=0, tokens_out=0, model="scripted")
