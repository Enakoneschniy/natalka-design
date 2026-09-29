"""Model access.

Calls go to OpenRouter (one account, any model) through Cloudflare AI Gateway rather than to the
provider directly: the gateway gives per-request logs, token and cost figures and retries without
letting a second analytics vendor see birth data. Only the base URL changes — the protocol is
OpenRouter's, which is OpenAI-compatible.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

import httpx

DEFAULT_MODEL = "anthropic/claude-sonnet-5"
OPENROUTER_DIRECT = "https://openrouter.ai/api"

#: USD per million tokens, as listed by OpenRouter. Only a fallback: OpenRouter returns the real
#: cost of each generation in `usage`, and that is what we store — it includes their markup and
#: any cache discount. This table is what keeps the numbers sane if the field ever goes missing.
PRICES: dict[str, tuple[float, float]] = {
    "anthropic/claude-sonnet-5": (2.0, 10.0),
    "anthropic/claude-opus-5": (5.0, 25.0),
    "anthropic/claude-haiku-4.5": (1.0, 5.0),
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
    ) -> None:
        self.api_key = api_key or os.environ.get("NATALKA_MODEL_API_KEY", "")
        self.base_url = (
            base_url or os.environ.get("NATALKA_AI_GATEWAY_URL") or OPENROUTER_DIRECT
        ).rstrip("/")
        self.model = model or os.environ.get("NATALKA_MODEL") or DEFAULT_MODEL
        self.timeout = timeout

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        if not self.api_key:
            raise ModelUnavailableError("NATALKA_MODEL_API_KEY is not set")
        try:
            response = httpx.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "authorization": f"Bearer {self.api_key}",
                    "content-type": "application/json",
                    # OpenRouter attributes traffic by these; they show up in its dashboard.
                    "http-referer": "https://chronika.me",
                    "x-title": "Chronika",
                },
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
            raise ModelUnavailableError(str(exc)) from exc

        if response.status_code >= 400:
            raise ModelUnavailableError(f"{response.status_code}: {response.text[:300]}")

        payload: dict[str, Any] = response.json()
        if payload.get("error"):
            raise ModelUnavailableError(str(payload["error"])[:300])

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
