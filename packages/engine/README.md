# natalka-engine

Pure calculation layer. No I/O except reading the bundled Swiss Ephemeris files.

- `ephemeris.py` — the **only** module that imports `swisseph` (pyswisseph). Everything else works with
  plain dataclasses, so the ephemeris backend can be swapped and the rest stays testable without it.
- `chart.py` — natal chart: planets, Chiron, nodes, Lilith, Pars Fortunae, Placidus houses and angles.
- `aspects.py` — aspects with per-body orbs, applying/separating.
- `transits.py` — sign ingresses and exact transit hits found by root-finding, not by "memory".
- `timeutil.py` — local birth time → UTC through IANA zones, including historical offsets.
- `geo/` — coordinates → time zone (`timezonefinder`); city lookup lives in the API (GeoNames in Postgres).

## Licence note (read before launch)

`pyswisseph` and the data files in `src/natalka_engine/ephe/` are Swiss Ephemeris, licensed AGPL-3.0.
Shipping a hosted product on the AGPL terms is not acceptable for us, so the **Swiss Ephemeris Professional
licence** (Astrodienst AG, one-time fee) must be purchased before the public launch. No other AGPL
dependency is allowed in this repository.

## Accuracy

Reference charts are compared with Astro-Seek: planets within ±1′, house cusps within ±1°.
`tests/test_reference_charts.py` loads `tests/fixtures/reference_charts.json`.
