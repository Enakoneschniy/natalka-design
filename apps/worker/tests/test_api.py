import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from natalka_texts import ScriptedProvider
from natalka_worker import api
from natalka_worker.api import app

client = TestClient(app)

THREE = "Перший абзац.\n\nДругий абзац.\n\nТретій абзац."


@pytest.fixture
def scripted(monkeypatch: pytest.MonkeyPatch) -> None:
    """No test may reach a real model, whatever the environment holds."""
    monkeypatch.setattr(api, "OpenRouterProvider", lambda: ScriptedProvider(THREE))


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_the_api_publishes_no_schema_and_no_docs() -> None:
    for path in ("/openapi.json", "/docs", "/redoc", "/docs/oauth2-redirect"):
        assert client.get(path).status_code == 404


def test_the_calculation_endpoints_are_gone() -> None:
    """They live in the public ephemeris service; this image must not answer for them."""
    for path in ("/v1/calc", "/v1/synastry", "/v1/zone", "/v1/wheel.svg"):
        assert client.get(path).status_code == 404
        assert client.post(path, json={}).status_code == 404


def test_horoscope_needs_a_chart() -> None:
    r = client.post(
        "/v1/horoscope",
        json={"facts": {}, "period": "week", "start": "2026-09-29", "end": "2026-10-06"},
    )
    assert r.status_code == 422


@pytest.fixture
def facts() -> dict[str, Any]:
    path = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "chart-1994-05-15.json"
    return json.loads(path.read_text())  # type: ignore[no-any-return]


def test_sections_titles_follow_the_address() -> None:
    vy = client.get("/v1/sections", params={"product": "natal", "lang": "ru"}).json()["sections"]
    ty = client.get(
        "/v1/sections", params={"product": "natal", "lang": "ru", "address": "ty"}
    ).json()["sections"]
    titles_vy = {s["id"]: s["title"] for s in vy}
    titles_ty = {s["id"]: s["title"] for s in ty}
    assert "Как вы работаете" in titles_vy.values()
    assert "Как ты работаешь" in titles_ty.values()
    assert client.get("/v1/sections", params={"address": "they"}).status_code == 422


def test_skeleton_takes_a_brand_and_drops_the_order_ref(facts: dict[str, Any]) -> None:
    body: dict[str, Any] = {
        "facts": facts,
        "transits": [],
        "sections": [],
        "product": "natal",
        "lang": "ru",
        "name": "Аня",
        "gender": "f",
        "place": "Київ",
        "order_ref": "ORDER-1",
        "brand": {"name": "Мария"},
        "address": "ty",
    }
    doc = client.post("/v1/skeleton", json=body).json()
    assert doc["brand"]["name"] == "Мария"
    assert doc["meta"]["order_ref"] is None
    body.pop("brand")
    assert client.post("/v1/skeleton", json=body).json()["meta"]["order_ref"] == "ORDER-1"


def test_the_pdf_download_name_is_neutral(facts: dict[str, Any]) -> None:
    body = {
        "facts": facts,
        "transits": [],
        "sections": [],
        "product": "natal",
        "lang": "ru",
        "name": "Аня",
        "gender": "f",
        "place": "Київ",
    }
    doc = client.post("/v1/skeleton", json=body).json()
    r = client.post("/v1/document", json=doc)
    assert r.status_code == 200
    assert 'filename="reading.pdf"' in r.headers["content-disposition"]


def test_a_field_this_image_does_not_know_is_refused(facts: dict[str, Any]) -> None:
    """An older image must not drop a newer field (a seller's brand) and answer as if all is well."""
    skeleton_body: dict[str, Any] = {"facts": facts, "name": "Аня", "sections": []}
    assert client.post("/v1/skeleton", json=skeleton_body).status_code == 200
    assert client.post("/v1/skeleton", json={**skeleton_body, "logo_v2": "x"}).status_code == 422
    section_body = {"facts": facts, "section_id": "intro", "name": "Аня", "tone_v2": "warm"}
    assert client.post("/v1/section", json=section_body).status_code == 422


def _bodies(facts: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """One valid body per endpoint that takes JSON."""
    return {
        "/v1/preview": {"facts": facts, "lang": "uk", "first_name": "", "second_name": ""},
        "/v1/horoscope": {"facts": facts, "start": "2026-10-06", "end": "2026-10-13"},
        "/v1/section": {"facts": facts, "section_id": "intro", "name": "Аня", "second_name": ""},
        "/v1/skeleton": {
            "facts": facts,
            "name": "Аня",
            "sections": [{"id": "intro", "title": "Вступ", "text": "Абзац.", "quote": False}],
        },
    }


@pytest.mark.usefixtures("scripted")
def test_every_request_model_refuses_a_field_it_does_not_know(facts: dict[str, Any]) -> None:
    for path, body in _bodies(facts).items():
        assert client.post(path, json=body).status_code == 200, path
        assert client.post(path, json={**body, "sig": "x"}).status_code == 422, path
    skeleton = _bodies(facts)["/v1/skeleton"]
    section = {**skeleton["sections"][0], "surprise": 1}
    assert client.post("/v1/skeleton", json={**skeleton, "sections": [section]}).status_code == 422


@pytest.mark.usefixtures("scripted")
@pytest.mark.parametrize(
    ("path", "field"),
    [
        ("/v1/preview", "first_name"),
        ("/v1/preview", "second_name"),
        ("/v1/horoscope", "name"),
        ("/v1/section", "name"),
        ("/v1/section", "second_name"),
        ("/v1/skeleton", "name"),
    ],
)
def test_names_stop_at_80_characters(facts: dict[str, Any], path: str, field: str) -> None:
    body = _bodies(facts)[path]
    assert client.post(path, json={**body, field: "Я" * 80}).status_code == 200
    assert client.post(path, json={**body, field: "Я" * 81}).status_code == 422


def test_titles_stop_at_200_characters(facts: dict[str, Any]) -> None:
    body = _bodies(facts)["/v1/skeleton"]
    written = body["sections"][0]
    for length, status in ((200, 200), (201, 422)):
        titled = {**body, "sections": [{**written, "title": "Т" * length}]}
        assert client.post("/v1/skeleton", json=titled).status_code == status

    document = client.post("/v1/skeleton", json=body).json()
    document["sections"][1]["title"] = "Т" * 201
    assert client.post("/v1/document", json=document).status_code == 422


def test_a_refusal_names_the_field_but_never_repeats_the_input(facts: dict[str, Any]) -> None:
    """The caller logs what comes back, and what was sent is a chart and a name."""
    long_name = "Оксана" * 20
    r = client.post("/v1/section", json={"facts": facts, "section_id": "intro", "name": long_name})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "name"]
    assert r.json()["detail"][0]["type"] == "string_too_long"
    assert "Оксана" not in r.text

    # A missing field is reported against the whole body; the body itself stays out.
    r = client.post("/v1/section", json={"facts": facts, "name": "Аня"})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "section_id"]
    assert "Аня" not in r.text
    assert "positions" not in r.text
