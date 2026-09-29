"""Model access.

Everything goes through Cloudflare AI Gateway rather than the provider's own host: it gives us
per-request logs, token and cost figures and retries without a second vendor seeing birth data.
The gateway speaks the provider's own protocol, so only the base URL changes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import httpx

DEFAULT_MODEL = "claude-sonnet-5"
ANTHROPIC_DIRECT = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"

#: USD per million tokens, for the cost we store next to each job.
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5": (15.0, 75.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
}


class ModelUnavailableError(RuntimeError):
    """The provider refused or the key is missing — the job should be retried, not failed."""


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    tokens_in: int
    tokens_out: int
    model: str

    @property
    def cost_micros(self) -> int:
        """Cost in millionths of a USD, so a fraction of a cent is still an integer."""
        prices = PRICES.get(self.model)
        if not prices:
            return 0
        usd = (self.tokens_in * prices[0] + self.tokens_out * prices[1]) / 1_000_000
        return round(usd * 1_000_000)


@runtime_checkable
class Provider(Protocol):
    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion: ...


class AnthropicProvider:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str = DEFAULT_MODEL,
        timeout: float = 180.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("NATALKA_ANTHROPIC_API_KEY", "")
        self.base_url = (
            base_url or os.environ.get("NATALKA_AI_GATEWAY_URL") or ANTHROPIC_DIRECT
        ).rstrip("/")
        self.model = model
        self.timeout = timeout

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        if not self.api_key:
            raise ModelUnavailableError("NATALKA_ANTHROPIC_API_KEY is not set")
        try:
            response = httpx.post(
                f"{self.base_url}/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:  # network, DNS, timeout
            raise ModelUnavailableError(str(exc)) from exc

        if response.status_code >= 400:
            raise ModelUnavailableError(f"{response.status_code}: {response.text[:300]}")

        payload = response.json()
        text = "".join(part.get("text", "") for part in payload.get("content", []))
        usage = payload.get("usage", {})
        return Completion(
            text=text.strip(),
            tokens_in=int(usage.get("input_tokens", 0)),
            tokens_out=int(usage.get("output_tokens", 0)),
            model=payload.get("model", self.model),
        )


class ScriptedProvider:
    """Returns prepared text instead of calling a model.

    Two uses: tests, and running the whole pipeline end to end before the model key is in place —
    the document comes out real, only the prose is a placeholder.
    """

    def __init__(self, text: str = "", *, per_section: list[str] | None = None) -> None:
        self.text = text
        self.queue = list(per_section or [])
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, *, max_tokens: int = 4096) -> Completion:
        self.calls.append((system, user))
        text = self.queue.pop(0) if self.queue else self.text
        return Completion(text=text, tokens_in=0, tokens_out=0, model="scripted")
