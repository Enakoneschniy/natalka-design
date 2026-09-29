from fastapi.testclient import TestClient
from natalka_worker.api import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


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
