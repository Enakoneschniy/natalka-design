from datetime import date, time

import pytest
from natalka_engine import NatalInput, chart_to_dict, compute_natal


@pytest.fixture(scope="session")
def facts() -> dict:
    chart = compute_natal(
        NatalInput(date(1994, 5, 15), time(15, 25), "Europe/Simferopol", 45.1972, 33.3664)
    )
    return chart_to_dict(chart)


@pytest.fixture(scope="session")
def facts_no_time() -> dict:
    chart = compute_natal(
        NatalInput(date(1994, 5, 15), None, "Europe/Simferopol", 45.1972, 33.3664)
    )
    return chart_to_dict(chart)
