"""Regenerate static TTF instances from Google Fonts variable files (needs the `fonttools` dev dependency)."""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
SOURCES = {
    "playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf": [
        ("PlayfairDisplay-Regular", 400),
        ("PlayfairDisplay-Medium", 500),
        ("PlayfairDisplay-Bold", 700),
    ],
    "playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf": [("PlayfairDisplay-Italic", 400)],
    "golostext/GolosText%5Bwght%5D.ttf": [
        ("GolosText-Regular", 400),
        ("GolosText-Medium", 500),
        ("GolosText-Bold", 700),
    ],
    "jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf": [
        ("JetBrainsMono-Regular", 400),
        ("JetBrainsMono-Medium", 500),
    ],
}
OUT = Path(__file__).resolve().parents[1] / "src" / "natalka_document" / "fonts"


def main() -> int:
    for rel, instances in SOURCES.items():
        data = urllib.request.urlopen(BASE + rel, timeout=60).read()
        tmp = OUT / "_variable.ttf"
        tmp.write_bytes(data)
        for name, weight in instances:
            font = instantiateVariableFont(TTFont(tmp), {"wght": weight}, inplace=False)
            for rec in font["name"].names:
                if rec.nameID in (1, 4):
                    rec.string = name.replace("-", " ")
                elif rec.nameID == 6:
                    rec.string = name
            font.save(OUT / f"{name}.ttf")
            print("wrote", name)
        tmp.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
