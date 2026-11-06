"""The form of address a reading is written in: formal «вы» (the default) or informal «ты»."""

from __future__ import annotations

from typing import Literal

Address = Literal["vy", "ty"]

#: Languages whose reading is on informal terms whatever the order asks: Spanish, the owner's
#: choice on 2026-11-06 — «tú» is how a reading speaks in Spain, and «usted» reads like a bank.
INFORMAL_LANGS = frozenset({"es"})


def address_for(lang: str, address: Address) -> Address:
    """The form a reading in `lang` is actually written in."""
    return "ty" if lang in INFORMAL_LANGS else address
