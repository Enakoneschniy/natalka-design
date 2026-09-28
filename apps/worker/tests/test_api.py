from fastapi.testclient import TestClient
from natalka_worker.api import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_calc_yevpatoria() -> None:
    r = client.post(
        "/v1/calc",
        json={"date": "1994-05-15", "time": "15:25", "latitude": 45.1972, "longitude": 33.3664},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["birth"]["zone"] == "Europe/Simferopol" and body["birth"]["utc_offset"] == "UTC+4"
    sun = next(p for p in body["positions"] if p["body"] == "sun")
    assert sun["degree"] == "24°24′" and sun["sign"] == "taurus"


def test_calc_unknown_time_has_no_houses() -> None:
    r = client.post("/v1/calc", json={"date": "1994-05-15", "latitude": 45.2, "longitude": 33.4})
    assert r.status_code == 200 and r.json()["houses"] is None


def test_wheel_svg() -> None:
    r = client.get(
        "/v1/wheel.svg",
        params={
            "date": "1994-05-15",
            "time": "15:25",
            "latitude": 45.1972,
            "longitude": 33.3664,
            "size": 400,
        },
    )
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")
    assert r.text.startswith("<svg") and "AC" in r.text


def test_validation() -> None:
    assert (
        client.post(
            "/v1/calc", json={"date": "1700-01-01", "latitude": 0, "longitude": 0}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/v1/calc", json={"date": "1994-05-15", "latitude": 95, "longitude": 0}
        ).status_code
        == 422
    )
