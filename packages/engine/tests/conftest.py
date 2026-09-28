from datetime import date, time

import pytest
from natalka_engine import NatalChart, NatalInput, compute_natal


@pytest.fixture(scope="session")
def yevpatoria() -> NatalChart:
    """Reference chart from the brief: Sun 24°24′ ♉, Moon 17°32′ ♋, ASC 20°34′ ♍, MC 18°34′ ♊."""
    return compute_natal(
        NatalInput(date(1994, 5, 15), time(15, 25), "Europe/Simferopol", 45.1972, 33.3664)
    )


@pytest.fixture(scope="session")
def kharkiv() -> NatalChart:
    """The legacy example reading (reference/astrolog/examples)."""
    return compute_natal(
        NatalInput(date(1986, 3, 15), time(22, 25), "Europe/Kyiv", 49.9935, 36.2304)
    )
