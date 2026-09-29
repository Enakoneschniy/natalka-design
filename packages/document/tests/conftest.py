"""Chart facts for the tests, as the ephemeris service produced them.

The calculation lives in a separate service now (see docs/ephemeris-service-brief.md), so the
tests read stored responses rather than computing charts: the same numbers, no dependency.
"""

import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture(scope="session")
def facts() -> dict:
    return _load("chart-1994-05-15.json")


@pytest.fixture(scope="session")
def facts_no_time() -> dict:
    return _load("chart-1994-05-15-no-time.json")
