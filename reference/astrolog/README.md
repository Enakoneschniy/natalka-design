# Reference: legacy "Астролог" pipeline

Original manual pipeline used to produce 30–40 page natal chart reading PDFs (Russian).
Kept as a quality reference for `packages/document` (PDF styling) and `packages/texts` (tone, structure).

- `astro_build_pdf.py` — ReportLab styling module: fonts, palette, cover, page frame, QuoteBox, HRule, key positions table.
- `astro_main_template.py` — skeleton of a per-client build script (client data, TOC, story assembly).
- `METHODOLOGY.md` — how a reading is produced (positions → main lines → transits → sections).
- `STYLE_GUIDE.md` — tone, banned AI clichés, gender agreement. The "insider info" section is NOT applicable to the product.
- `examples/` — one complete reading (chart 15.03.1986 22:25 Kharkiv): `main.py` (imports `build_pdf`/`content*` — old module names), `content_natal.py`, `content_love_work.py`, `content_timeline.py`.

Known gaps vs. the product: planet positions were read manually from an Astro-Seek image; transit dates in
`content_timeline.py` came from the model's memory, not from ephemeris calculation. Texts live as Python
constants (fragile quoting). All of this is replaced by `packages/engine` + a JSON document schema.
