"""The measure scripts in scripts/ call this API with its key, and nothing else is sent the key.

Both deployed services are answered in process, so the scripts run end to end without a network.
"""

import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[3]
CHART = ROOT / "tests" / "fixtures" / "chart-1994-05-15.json"
KEY = "measure-key-" + "x" * 32
API_HOST = "natalka-api.ceo-63e.workers.dev"
EPHEMERIS_HOST = "ephemeris-api.ceo-63e.workers.dev"


def _load(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SECTION = {
    "id": "intro",
    "title": "Вступ",
    "quote": False,
    "text": "Абзац.",
    "problems": [],
    "attempts": 1,
    "tokens_in": 1,
    "tokens_out": 1,
    "cost_micros": 1,
    "model": "scripted",
}


class Services:
    """The API and the ephemeris service; the API answers only with the right key."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if request.url.host == EPHEMERIS_HOST:
            return self._ephemeris(path)
        if request.url.host == API_HOST:
            if request.headers.get("x-api-key") != KEY:
                return httpx.Response(401, json={"error": "unauthorized"})
            return self._api(path, request)
        return httpx.Response(404)

    @staticmethod
    def _ephemeris(path: str) -> httpx.Response:
        answers: dict[str, Any] = {
            "/v1/calc": {**json.loads(CHART.read_text()), "transits": []},
            "/v1/transits": {"events": []},
            "/v1/sky": {"positions": []},
        }
        return httpx.Response(200, json=answers[path]) if path in answers else httpx.Response(404)

    @staticmethod
    def _api(path: str, request: httpx.Request) -> httpx.Response:
        if path == "/v1/sections":
            return httpx.Response(200, json={"sections": [{"id": "intro", "title": "Вступ"}]})
        if path == "/v1/section":
            return httpx.Response(200, json=SECTION)
        if path == "/v1/horoscope":
            body = json.loads(request.content)
            window = {"start": body["start"], "end": body["end"], "events": 0}
            return httpx.Response(200, json={**SECTION, **window})
        return httpx.Response(404)


@pytest.fixture
def services(monkeypatch: pytest.MonkeyPatch) -> Services:
    fake = Services()
    real = httpx.Client

    def offline(**kw: Any) -> httpx.Client:
        return real(transport=httpx.MockTransport(fake), **kw)

    monkeypatch.setattr(httpx, "Client", offline)
    return fake


def _keys_went_to_the_api_alone(services: Services) -> None:
    api = [r for r in services.requests if r.url.host == API_HOST]
    ephemeris = [r for r in services.requests if r.url.host == EPHEMERIS_HOST]
    assert api and ephemeris
    assert all(r.headers.get("x-api-key") == KEY for r in api)
    assert not [r for r in ephemeris if "x-api-key" in r.headers]


@pytest.mark.parametrize("script", ["measure_reading", "measure_horoscope"])
def test_a_measure_script_will_not_start_without_the_key(
    script: str,
    services: Services,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("NATALKA_API_KEY", raising=False)
    assert _load(script).main([]) == 2
    assert not services.requests
    assert "NATALKA_API_KEY" in capsys.readouterr().err


def test_measure_reading_sends_the_key_to_the_api_alone(
    services: Services, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("NATALKA_API_KEY", KEY)
    assert _load("measure_reading").main(["--out", str(tmp_path / "reading")]) == 0
    _keys_went_to_the_api_alone(services)
    assert (tmp_path / "reading.pdf").stat().st_size > 0


def test_measure_horoscope_sends_the_key_to_the_api_alone(
    services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("NATALKA_API_KEY", KEY)
    assert _load("measure_horoscope").main([]) == 0
    _keys_went_to_the_api_alone(services)
    windows = [json.loads(r.content) for r in services.requests if r.url.path == "/v1/horoscope"]
    assert [w["period"] for w in windows] == ["week", "month"]
    assert all(w["start"] < w["end"] for w in windows)
