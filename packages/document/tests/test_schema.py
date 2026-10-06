import json
from pathlib import Path

import pytest
from natalka_document.build import NO_TIME_SKIPPED, natal_skeleton
from natalka_document.schema import Birth, Document, Paragraph, Person, clean_markup
from pydantic import ValidationError

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "natal-uk.json"


def test_markup_whitelist() -> None:
    assert clean_markup("a <b>b</b> <i>c</i><br>") == "a <b>b</b> <i>c</i><br/>"
    assert (
        clean_markup('<script>x</script> & <font color="red">y</font>')
        == '&lt;script&gt;x&lt;/script&gt; &amp; &lt;font color="red"&gt;y&lt;/font&gt;'
    )
    assert Paragraph(text="  <B>x</B>  ").text == "<b>x</b>"


def test_example_roundtrip() -> None:
    doc = Document.model_validate_json(EXAMPLE.read_text(encoding="utf-8"))
    again = Document.model_validate_json(doc.model_dump_json())
    assert again == doc
    assert doc.section("chart").blocks[0].type == "wheel"
    assert json.loads(doc.model_dump_json())["meta"]["product"] == "natal"


def test_skeleton_unknown_time_drops_house_sections(facts_no_time: dict) -> None:
    doc = natal_skeleton(facts_no_time, person=Person(name="A"), place="Київ", lang="uk")
    ids = {s.id for s in doc.sections}
    assert doc.unknown_time and not ids & NO_TIME_SKIPPED
    assert doc.facts["houses"] is None


def test_coordinates_stay_on_the_globe() -> None:
    birth = {"date": "1994-05-15", "place": "X", "zone": "UTC", "utc_offset": "UTC+0"}
    for lat, lon in ((90, 180), (-90, -180), (45.1972, 33.3664)):
        Birth(**birth, latitude=lat, longitude=lon)
    nan, inf = float("nan"), float("inf")
    for lat, lon in ((90.01, 0), (-91, 0), (0, 180.5), (0, -181), (nan, 0), (0, inf)):
        with pytest.raises(ValidationError):
            Birth(**birth, latitude=lat, longitude=lon)


def test_extra_fields_rejected(facts: dict) -> None:
    doc = natal_skeleton(facts, person=Person(name="A"), place="Київ", lang="uk")
    data = json.loads(doc.model_dump_json())
    data["sections"][0]["surprise"] = 1
    with pytest.raises(ValidationError):
        Document.model_validate(data)
