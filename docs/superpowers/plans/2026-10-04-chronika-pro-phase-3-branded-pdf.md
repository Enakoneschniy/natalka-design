# Chronika Pro — Phase 3: Branded PDF and «ты/вы» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller's PDF carries the seller's brand (name or logo, photo, contacts, signature, intro/closing text, accent colour) and nothing of ours. A seller chooses «ты» or «вы», and the texts are written, validated and titled in that form. B2C PDFs and texts do not change.

**Architecture:**
- Python:
  - `packages/texts` gains an `address` parameter (`'vy' | 'ty'`) for the system prompt, the validator and section titles.
  - `packages/document` gains an optional `Document.brand` that the renderer honours. Without a brand, it renders exactly as today.
  - `apps/worker` passes both through `/v1/sections`, `/v1/section`, `/v1/skeleton`.
- TypeScript (`apps/jobs`):
  - Stores the seller's brand (D1 + R2 images).
  - Snapshots the address form on each reading.
  - Sends `address` to the text API and `brand` to the skeleton for seller orders. A seller cannot assemble a PDF without a brand.

**Tech Stack:**
- Python 3.12 (uv workspace, pydantic v2, ReportLab 5, FastAPI, pytest, ruff, mypy strict)
- Cloudflare Workers + D1 + R2 (TypeScript strict, Vitest via `@cloudflare/vitest-plugin`)

**Spec:** `docs/chronika-pro/SPEC.md`, section *Product*: branding, «ты/вы», "no mention of us anywhere in the PDF (content, metadata, file name)", one mandatory disclaimer line. The decisions below are the controller's (the owner delegated them on 2026-10-04); Task 8 writes them into the spec.

## Decisions made for this phase

- **Brand fields:**
  - `name` (1–60, required to assemble a PDF)
  - `contacts` (≤ 4 lines, each ≤ 80)
  - `accent` (`#RRGGBB`, default `#E7B75C`)
  - `intro` and `outro` (≤ 3000 chars each, plain text; blank line = new paragraph)
  - `signature` (≤ 80)
  - `logo` and `photo` (PNG or JPEG, ≤ 1 MB each)
- **The PDF shows the brand like this:**
  - Cover: the logo (or the brand name, letter-spaced, upper case) where "C H R O N I K A" stands today. The accent colour replaces the cover gold. The footer is `date · first contact line`, with no order reference and no domain.
  - Eyebrows: accent coloured.
  - A "От автора" page after the cover, only if there is an intro or a photo: photo, intro paragraphs, signature.
  - Closing block before the disclaimer, only if there is an outro: outro paragraphs, signature, contact lines.
  - PDF metadata: `author` and `creator` are the brand name.
- **The disclaimer stays** (it never names us). Body headers and footers already name only the reading and the client.
- **Address form:**
  - `'vy'` (default, B2C, unchanged prompt **byte for byte**) or `'ty'`.
  - For `'ty'`: the prompt asks for «ты»/«ти» to one person. Plural «вы» for the two people of a synastry stays allowed.
  - The validator no longer flags informal address, and requires second-person singular ты-forms instead of вы-forms in long sections.
  - Two section titles and the forecast cover subtitle have ты-variants.
- **The address form is snapshotted per reading** (`pro_readings.address`, from `pro_accounts.tone` at ordering). A rewrite uses the reading's form, not the account's current one.
- **The brand is read when the PDF is assembled**, so a new logo shows up on the next assembly.
- **`assemblePdf` refuses `no_brand`** when the seller has no brand name. A seller PDF must never fall back to our branding.
- **`/v1/document`'s `content-disposition` filename** becomes `reading.pdf` (the jobs worker names files itself; this only removes our name).

## Global Constraints

- **B2C stays identical.** Without `brand` the renderer output is unchanged. With `address='vy'` the system prompt string is byte-identical to today's, and the validator and titles behave as today.
- Python passes `uv run ruff check packages apps`, `uv run ruff format --check packages apps`, `uv run mypy` and `uv run pytest -q`. Line length is 100.
- TypeScript passes `corepack pnpm --filter @natalka/jobs test` and `corepack pnpm --filter @natalka/jobs exec tsc --noEmit`. pnpm is not on PATH, so use `corepack pnpm`.
- Seller-supplied text (brand name, contacts, intro, outro, signature) is **escaped** before it reaches ReportLab markup. It is untrusted input.
- Images are accepted only as PNG or JPEG, checked by **magic bytes**, ≤ 1 MB decoded, and stored in R2 under `brand/<account_id>/`.
- No auth libraries, no ORM, plain SQL. Timestamps are ISO-8601 UTC strings. Ids are `crypto.randomUUID()`.
- Commit messages are English outcome sentences ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `.devcontainer/docker-compose.yml`, `.gitignore` or `apps/jobs/.wrangler/`. Never run remote wrangler commands.

## Review Focus

1. **A seller with no brand asks for a PDF.** Expected: `no_brand` (409). Never a Chronika-branded PDF. → Task 7 test.
2. **Brand text with markup characters** (`<b>`, `&`, `<script>`). Expected: rendered literally, and the renderer does not crash. → Task 2 test.
3. **A «ты» reading that addresses two people with plural «вы»** (synastry). Expected: not flagged. → Task 1 test.
4. **A file named `.png` that is not a PNG**, or 1 MB + 1 byte. Expected: 400 and nothing stored. → Task 6 test.
5. **The seller switches «вы»→«ты» after ordering, then rewrites a section.** Expected: the rewrite is still «вы». → Task 7 test.

---

## File structure

| File | Change |
|---|---|
| `packages/texts/src/natalka_texts/prompts.py` | `system_prompt(..., address)`; address rule in the ADDRESS block |
| `packages/texts/src/natalka_texts/validate.py` | `check(..., address)`; ты-aware address checks; ты-phrases in IMPLIES_KNOWLEDGE |
| `packages/texts/src/natalka_texts/sections.py` | `SectionSpec.titles_ty`; `title(spec, lang, address)` |
| `packages/document/src/natalka_document/schema.py` | `Brand`; `Document.brand` |
| `packages/document/src/natalka_document/render.py` | brand on cover, "От автора" page, closing block, accent, metadata |
| `packages/document/src/natalka_document/labels.py` | `from_author` label per language |
| `packages/document/src/natalka_document/build.py` | `skeleton(..., brand, address)`; ты cover subtitle |
| `apps/worker/src/natalka_worker/api.py` | `address` and `brand` passed through; neutral filename |
| `apps/jobs/migrations/0010_pro_brand.sql` | `pro_brands`; `pro_readings.address` |
| `apps/jobs/src/pro/brand.ts` | brand storage, validation, images, document payload |
| `apps/jobs/src/pro/routes.ts` | brand routes |
| `apps/jobs/src/pro/readings.ts`, `lifecycle.ts`, `src/pipeline.ts` | address snapshot and use; brand at render; `no_brand` |
| `apps/jobs/test/fakes.ts` | record the last request body per path and name |

---

### Task 1: «ты/вы» in the text package

**Files:**
- Modify: `packages/texts/src/natalka_texts/prompts.py`, `validate.py`, `sections.py`
- Test: `packages/texts/tests/test_address.py` (new)

**Interfaces:**
- Produces:
  - `Address = Literal["vy", "ty"]` (in `prompts.py`, re-exported where convenient)
  - `system_prompt(lang: str, gender: str, product: str = "natal", address: Address = "vy") -> str`
  - `check(text, *, lang, min_paragraphs, max_paragraphs, impersonal_ok=False, address: Address = "vy") -> Report`
  - `SectionSpec.titles_ty: dict[str, str]`, which defaults to empty
  - `title(spec: SectionSpec, lang: str, address: Address = "vy") -> str`

- [ ] **Step 1: Write the failing tests**

`packages/texts/tests/test_address.py`:

```python
from natalka_texts import prompts
from natalka_texts.prompts import system_prompt
from natalka_texts.sections import specs, title
from natalka_texts.validate import check

FORMAL_RULE = (
    "In Russian and Ukrainian this is the\nformal «вы» / «ви» throughout — never «ты» / «ти», "
    "in any sentence, however warm the moment."
)

TY_TEXT = "\n\n".join(
    [
        "Твоё Солнце в Тельце делает тебя упорным человеком, и ты редко сдаёшься. " * 3,
        "Луна в Раке подсказывает, что тебе важен дом и близкие люди рядом. " * 3,
        "Асцендент в Деве объясняет, почему ты замечаешь детали раньше других. " * 3,
    ]
)
VY_TEXT = TY_TEXT.replace("Твоё", "Ваше").replace("тебя", "вас").replace("ты ", "вы ").replace(
    "тебе", "вам"
).replace("сдаёшься", "сдаётесь").replace("замечаешь", "замечаете")


def _addr(problems: tuple[str, ...]) -> list[str]:
    return [p for p in problems if "inform" in p or "addressing" in p or "talks about" in p]


def test_formal_prompt_is_unchanged() -> None:
    text = system_prompt("ru", "f", "natal")
    assert FORMAL_RULE in text
    assert text == system_prompt("ru", "f", "natal", address="vy")
    assert prompts.SYSTEM in text


def test_informal_prompt_asks_for_ty_and_keeps_everything_else() -> None:
    ty = system_prompt("ru", "f", "natal", address="ty")
    assert FORMAL_RULE not in ty
    assert "«ты» / «ти»" in ty
    vy = system_prompt("ru", "f", "natal")
    assert ty.replace(ty.split("ADDRESS\n", 1)[1].split("\n\nTONE", 1)[0], "") == vy.replace(
        vy.split("ADDRESS\n", 1)[1].split("\n\nTONE", 1)[0], ""
    )


def test_validator_follows_the_address_form() -> None:
    assert _addr(check(TY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3).problems)
    assert not _addr(
        check(TY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, address="ty").problems
    )
    assert not _addr(check(VY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3).problems)
    assert _addr(
        check(VY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, address="ty").problems
    )


def test_informal_reading_may_speak_to_a_pair_in_plural() -> None:
    pair = TY_TEXT + "\n\nВы оба цените честность, и вам легко договориться. " * 1
    report = check(pair, lang="ru", min_paragraphs=3, max_paragraphs=4, address="ty")
    assert not _addr(report.problems)


def test_ty_reading_still_bans_implied_knowledge() -> None:
    text = TY_TEXT + "\n\nКак ты знаешь, всё повторяется."
    report = check(text, lang="ru", min_paragraphs=3, max_paragraphs=4, address="ty")
    assert any("как ты знаешь" in p for p in report.problems)


def test_titles_follow_the_address_form() -> None:
    work = next(s for s in specs("natal", unknown_time=False) if s.id == "work.style")
    assert title(work, "ru") == "Как вы работаете"
    assert title(work, "ru", "ty") == "Как ты работаешь"
    assert title(work, "uk", "ty") == "Як ти працюєш"
    assert title(work, "en", "ty") == "How you work"
    overview = next(s for s in specs("natal", unknown_time=False) if s.id == "natal.overview")
    assert title(overview, "ru", "ty") == title(overview, "ru")
```

Before writing the test, check two things:
- the ids of the work section (`"Как вы работаете"`, sections.py ~205) and of the forecast "ground" section (sections.py ~397);
- the exact formal sentence in `prompts.SYSTEM`.

Put them into the test verbatim (replace `work.style` and the `FORMAL_RULE` line breaks with what the file actually has). Add a second title assertion for the ground section: `"Почва твоей карты"` / `"Ґрунт твоєї карти"`.

- [ ] **Step 2: Run to see it fail**

Run: `uv run pytest -q packages/texts/tests/test_address.py`
Expected: FAIL (unexpected keyword `address`).

- [ ] **Step 3: Implement**

`prompts.py`:
1. Add `Address = Literal["vy", "ty"]` (import `Literal`).
2. In the ADDRESS block of `SYSTEM`, replace the formal sentence with the placeholder `{address_rule}`. Rename that template to `_SYSTEM_TEMPLATE`.
3. Define the two rules, keeping the wording and line breaks of the current sentence for `vy`:

```python
ADDRESS_RULE: dict[str, str] = {
    "vy": (
        "In Russian and Ukrainian this is the\nformal «вы» / «ви» throughout — never «ты» / «ти», "
        "in any sentence, however warm the moment."
    ),
    "ty": (
        "In Russian and Ukrainian this is the\ninformal «ты» / «ти» throughout — warm and direct, "
        "never «вы» / «ви» to this one person. In a synastry the two of them together may be «вы»."
    ),
}
SYSTEM = _SYSTEM_TEMPLATE.replace("{address_rule}", ADDRESS_RULE["vy"])
```

Use `.replace`, not `.format`: the template contains other braces. Make the `vy` rule reproduce the original text exactly, then `system_prompt` builds from `_SYSTEM_TEMPLATE.replace("{address_rule}", ADDRESS_RULE[address])` instead of `SYSTEM`. The first test pins byte-identity.

`validate.py`:
1. Append ты-phrases to `IMPLIES_KNOWLEDGE`:
   - ru: `"ты писал"`, `"ты писала"`, `"ты говорил"`, `"ты говорила"`, `"как ты знаешь"`, `"как ты сам"`, `"как ты сама"`, `"ты упомянул"`, `"ты упомянула"`, `"из твоего письма"`
   - uk: `"ти писав"`, `"ти писала"`, `"ти казав"`, `"ти казала"`, `"як ти знаєш"`, `"як ти сам"`, `"як ти сама"`, `"з твого листа"`
2. `_language_problems(text, lang, *, impersonal_ok=False, address="vy")`:
   - When `address == "vy"`: exactly today's logic.
   - When `address == "ty"`: no "addresses the reader informally" problem. The "talks about the reader" check passes if `INFORMAL[lang]` matches (for `en`, `SECOND_PERSON["en"]` still applies). Do not flag вы-forms: plural вы is legitimate. A long section with no ты-form gets the problem `"the section talks about the reader instead of addressing them as «ты»"`.
3. `check(..., address="vy")` passes `address` through.

`sections.py`:
1. Add `titles_ty: dict[str, str] = field(default_factory=dict)` to `SectionSpec`.
2. Set `titles_ty={"ru": "Как ты работаешь", "uk": "Як ти працюєш"}` on the work section, and `{"ru": "Почва твоей карты", "uk": "Ґрунт твоєї карти"}` on the ground section.
3. Change `title`:

```python
def title(spec: SectionSpec, lang: str, address: Address = "vy") -> str:
    if address == "ty" and lang in spec.titles_ty:
        return spec.titles_ty[lang]
    return spec.titles.get(lang) or spec.titles.get("en") or spec.id
```

(import `Address` from `.prompts`; if that import creates a cycle, define `Address` in a small `natalka_texts/address.py` and import it from there in both modules.)

- [ ] **Step 4: Run to see it pass; then the whole Python gate**

```bash
uv run pytest -q packages/texts
uv run ruff check packages apps && uv run ruff format --check packages apps && uv run mypy && uv run pytest -q
```

Expected: all green. The existing `test_informal_address_is_rejected` still passes, because it uses the default `vy`.

- [ ] **Step 5: Commit**

```bash
git add packages/texts
git commit -m "Let a reading speak in «ты» when the seller asks for it, and keep «вы» untouched"
```

---

### Task 2: A brand in the document, and the renderer honouring it

**Files:**
- Modify: `packages/document/src/natalka_document/schema.py`, `render.py`, `labels.py`
- Test: `packages/document/tests/test_brand.py` (new)

**Interfaces:**
- Produces in `schema.py`:

```python
class Brand(_Strict):
    """A seller's brand. When present, the document is the seller's: nothing of ours is drawn."""

    name: str = Field(min_length=1, max_length=60)
    contacts: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list, max_length=4
    )
    accent: str = Field(default="#E7B75C", pattern=r"^#[0-9A-Fa-f]{6}$")
    intro: str = Field(default="", max_length=3000)
    outro: str = Field(default="", max_length=3000)
    signature: str = Field(default="", max_length=80)
    #: PNG or JPEG, base64, at most 1 MB decoded.
    logo: str | None = None
    photo: str | None = None

    @field_validator("logo", "photo")
    @classmethod
    def _image(cls, value: str | None) -> str | None:
        if value is None:
            return None
        raw = base64.b64decode(value, validate=True)
        if len(raw) > 1_048_576:
            raise ValueError("image larger than 1 MB")
        if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
            raise ValueError("image must be PNG or JPEG")
        return value
```

  plus `Document.brand: Brand | None = None`.
- `labels.py`: a `from_author` key in every language: uk "Від автора", en "From the author", ru "От автора", pl "Od autora", de "Vom Autor".

- [ ] **Step 1: Write the failing tests**

`packages/document/tests/test_brand.py`:

```python
import base64
import io
import struct
import zlib
from pathlib import Path

import pypdfium2 as pdfium
import pytest
from natalka_document.render import render_pdf
from natalka_document.schema import Brand, Document
from pydantic import ValidationError

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "natal-uk.json"


def _png(w: int = 8, h: int = 8) -> str:
    """A tiny valid PNG, built by hand so the test needs no image library."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\x00" + b"\xe7\xb7\x5c" * w for _ in range(h))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(png).decode()


def _doc(brand: Brand | None) -> Document:
    doc = Document.model_validate_json(EXAMPLE.read_text(encoding="utf-8"))
    doc.brand = brand
    doc.meta.order_ref = "ORDER-REF-123"
    return doc


def _render(doc: Document) -> tuple[list[str], dict[str, str]]:
    buf = io.BytesIO()
    render_pdf(doc, buf)
    pdf = pdfium.PdfDocument(buf.getvalue())
    texts = [pdf[i].get_textpage().get_text_range() for i in range(len(pdf))]
    return texts, pdf.get_metadata_dict()


BRAND = Brand(
    name="Мария Звёздная",
    contacts=["@maria.stars", "+48 600 000 000"],
    accent="#8E7CC3",
    intro="Дорогой друг,\n\nэтот разбор я подготовила специально для вас.",
    outro="Спасибо, что доверились.",
    signature="Мария",
    logo=None,
    photo=_png(),
)


def test_without_a_brand_nothing_changes() -> None:
    texts, meta = _render(_doc(None))
    assert "C H R O N I K A" in texts[0] and "chronika.me" in texts[0]
    assert "ORDER-REF-123" in texts[0]
    assert meta.get("Author") == "Chronika"


def test_a_branded_document_carries_nothing_of_ours() -> None:
    texts, meta = _render(_doc(BRAND))
    whole = "\n".join(texts)
    assert "CHRONIKA" not in whole.upper().replace(" ", "")
    assert "chronika" not in whole.lower()
    assert "ORDER-REF-123" not in whole
    assert all("chronika" not in str(v).lower() for v in meta.values())
    assert meta.get("Author") == "Мария Звёздная"
    assert "М А Р И Я" in texts[0] or "МАРИЯ" in texts[0].replace(" ", "")
    assert "@maria.stars" in texts[0]


def test_a_branded_document_opens_with_the_author_and_closes_with_them() -> None:
    texts, _ = _render(_doc(BRAND))
    assert "ВІД АВТОРА" in texts[1].upper()
    assert "специально для вас" in texts[1]
    assert any("Спасибо, что доверились" in t and "+48 600 000 000" in t for t in texts[-3:])


def test_seller_text_is_shown_literally() -> None:
    hostile = BRAND.model_copy(
        update={"intro": "<b>жирно</b> & <script>x</script> <font size=99>", "logo": _png()}
    )
    texts, _ = _render(_doc(hostile))
    assert "<b>жирно</b> & <script>x</script>" in texts[1]


def test_images_must_be_png_or_jpeg_within_a_megabyte() -> None:
    with pytest.raises(ValidationError):
        Brand(name="X", logo=base64.b64encode(b"GIF89a....").decode())
    with pytest.raises(ValidationError):
        Brand(name="X", photo=base64.b64encode(b"\xff\xd8\xff" + b"0" * 1_048_576).decode())
    with pytest.raises(ValidationError):
        Brand(name="X", accent="purple")
    with pytest.raises(ValidationError):
        Brand(name="X", contacts=["a", "b", "c", "d", "e"])
```

The example document is in Ukrainian, so the "От автора" label is the uk one ("Від автора"). Adjust only that string if `labels.py` holds a different uk wording. The intro and outro texts are the seller's and stay as written.

- [ ] **Step 2: Run to see it fail**

Run: `uv run pytest -q packages/document/tests/test_brand.py`
Expected: FAIL (cannot import `Brand`).

- [ ] **Step 3: Schema and labels**

Add `Brand` and `Document.brand` as specified above (imports: `base64`, `Annotated`, `field_validator`). Add the `from_author` label.

- [ ] **Step 4: Renderer**

In `render.py`, all of the following applies **only when `self.doc.brand` is set**. Otherwise every line of output stays as today.

1. **Text helpers:**
   - `from xml.sax.saxutils import escape`.
   - `_paragraphs(text: str) -> list[str]`, which splits on blank lines, strips, and drops empties.
   - Every seller string that goes into a `Paragraph` passes through `escape(...)`. Strings drawn with `canv.drawString`/`drawCentredString` are not markup and need no escaping.
2. **Accent:**
   - `self.accent = HexColor(brand.accent) if brand else st.GOLD_BRIGHT`.
   - `self.s_eyebrow = ParagraphStyle("EyebrowBrand", parent=st.s_eyebrow, textColor=HexColor(brand.accent)) if brand else st.s_eyebrow`. Use `self.s_eyebrow` wherever `_section` and `_toc` used `st.s_eyebrow`.
   - On the cover, every `st.GOLD_BRIGHT` becomes `self.accent`.
3. **Metadata** in `render()`: `author=brand.name if brand else "Chronika"`. When a brand is set, also pass `creator=brand.name`. If `BaseDocTemplate` in the installed ReportLab rejects `creator`, set `doc.creator` after construction instead. Verify that the metadata test passes either way.
4. **Cover** (`_cover_page`):
   - Replace the `"C H R O N I K A"` line. With a logo: draw it centred at `h * 0.295` baseline, max height 1.2 cm and max width 5 cm, keeping the aspect ratio. Use `ImageReader(io.BytesIO(base64.b64decode(logo)))` and `canv.drawImage(..., mask="auto")`. Without a logo: draw `" ".join(brand.name.upper())` in the accent, `st.SANS` 8.5.
   - Footer: with a brand, `f"{generated_at:%Y-%m-%d}"` plus `f"  ·  {contacts[0]}"` if there are contacts. No order_ref, no domain.
5. **"От автора" page:** when `brand.intro` or `brand.photo` is set, insert it right after the cover in `_story()`, before the TOC. Use the same `_ThemeMarker(motifs.PageTheme("intro", ui(lang, "from_author")))` pattern and a `PageBreak`. The page holds:
   - the eyebrow `ui(lang, "from_author").upper()` in `self.s_eyebrow`;
   - the photo as a platypus `Image` (width 4.5 cm, height by aspect ratio, `hAlign="LEFT"`) if present;
   - the intro paragraphs in `st.s_body` (or the body style the sections use);
   - the signature right-aligned in italics (`ParagraphStyle(parent=st.s_body, fontName="PlayfairDisplay-Italic", alignment=TA_RIGHT)`) if present.

   The TOC must still start on its own page.
6. **Closing block:** when `brand.outro` is set, add before `closing_note`: `Spacer`, `st.HRule()`, the outro paragraphs, the signature (as above), then each contact line in `st.s_caption`.
7. **Name collisions:** keep `_body_page` unchanged. Its header shows cover title, client name, date and place, none of which is ours.

- [ ] **Step 5: Run to see it pass; full Python gate**

```bash
uv run pytest -q packages/document
uv run ruff check packages apps && uv run ruff format --check packages apps && uv run mypy && uv run pytest -q
uv run natalka-document render packages/document/examples/natal-uk.json /tmp/natal-uk.pdf
```

Expected: green. The example still renders exactly as before (it has no brand).

- [ ] **Step 6: Commit**

```bash
git add packages/document
git commit -m "Draw a seller's brand on their reading, and nothing of ours"
```

---

### Task 3: The skeleton takes the brand and the address form

**Files:**
- Modify: `packages/document/src/natalka_document/build.py`
- Test: `packages/document/tests/test_brand.py` (append)

**Interfaces:**
- Produces: `skeleton(..., brand: Brand | None = None, address: Literal["vy", "ty"] = "vy")`. The keyword-only args are added at the end. The function sets `Document.brand = brand` and picks the cover subtitle by address.
- `COVER_SUBTITLE_TY: dict[str, dict[str, str]] = {"forecast": {"ru": "по транзитам твоей карты", "uk": "за транзитами твоєї карти"}}`. For any product, language or address missing from it, fall back to `COVER_SUBTITLE`.

- [ ] **Step 1: Failing test** (append to `test_brand.py`)

```python
from natalka_document.build import skeleton
from natalka_document.schema import Person


def test_skeleton_carries_the_brand_and_the_address(facts: dict) -> None:
    doc = skeleton(
        facts, product="forecast", person=Person(name="Аня"), place="Київ", lang="ru",
        brand=BRAND, address="ty",
    )
    assert doc.brand == BRAND
    assert doc.cover.subtitle == "по транзитам твоей карты"
    plain = skeleton(facts, product="forecast", person=Person(name="Аня"), place="Київ", lang="ru")
    assert plain.brand is None
    assert plain.cover.subtitle == "по транзитам вашей карты"
```

(The `facts` fixture comes from `conftest.py`.)

- [ ] **Step 2: RED → implement → GREEN**, then the full Python gate.

- [ ] **Step 3: Commit**

```bash
git add packages/document
git commit -m "Build a seller's document with their brand and their form of address"
```

---

### Task 4: The worker API passes address and brand through

**Files:**
- Modify: `apps/worker/src/natalka_worker/api.py`
- Test: `apps/worker/tests/test_api.py` (append)

**Interfaces:**
- `SectionRequest.address: Literal["vy", "ty"] = "vy"`. It is used in `system_prompt(...)`, in both `check(...)` calls, and in both `title(spec, req.lang, req.address)` calls.
- Both `check(...)` calls in `/v1/section` also pass `pair=(req.product == "synastry")` (Task 1 added `check(..., pair)`: in «ты» mode a synastry section may address the pair as plural «вы»).
- `GET /v1/sections?address=vy|ty` (default `vy`) is used for titles.
- `SkeletonRequest.address: Literal["vy", "ty"] = "vy"` and `SkeletonRequest.brand: Brand | None = None`, passed to `build_skeleton`. When `brand` is set, `order_ref` is ignored (pass `None`) so it cannot reach the cover.
- `/v1/document`: `content-disposition: attachment; filename="reading.pdf"`.

- [ ] **Step 1: Failing tests**

```python
def test_sections_titles_follow_the_address() -> None:
    vy = client.get("/v1/sections", params={"product": "natal", "lang": "ru"}).json()["sections"]
    ty = client.get(
        "/v1/sections", params={"product": "natal", "lang": "ru", "address": "ty"}
    ).json()["sections"]
    titles_vy = {s["id"]: s["title"] for s in vy}
    titles_ty = {s["id"]: s["title"] for s in ty}
    assert "Как вы работаете" in titles_vy.values()
    assert "Как ты работаешь" in titles_ty.values()
    assert client.get("/v1/sections", params={"address": "they"}).status_code == 422


def test_skeleton_takes_a_brand_and_drops_the_order_ref(facts: dict) -> None:
    body = {
        "facts": facts, "transits": [], "sections": [], "product": "natal", "lang": "ru",
        "name": "Аня", "gender": "f", "place": "Київ", "order_ref": "ORDER-1",
        "brand": {"name": "Мария"}, "address": "ty",
    }
    doc = client.post("/v1/skeleton", json=body).json()
    assert doc["brand"]["name"] == "Мария"
    assert doc["meta"]["order_ref"] is None
    body.pop("brand")
    assert client.post("/v1/skeleton", json=body).json()["meta"]["order_ref"] == "ORDER-1"


def test_the_pdf_download_name_is_neutral(facts: dict) -> None:
    body = {"facts": facts, "transits": [], "sections": [], "product": "natal", "lang": "ru",
            "name": "Аня", "gender": "f", "place": "Київ"}
    doc = client.post("/v1/skeleton", json=body).json()
    r = client.post("/v1/document", json=doc)
    assert r.status_code == 200
    assert 'filename="reading.pdf"' in r.headers["content-disposition"]
```

If `apps/worker/tests` has no `facts` fixture, load `tests/fixtures/chart-1994-05-15.json` from the repo root, the way `packages/document/tests/conftest.py` does, in a small fixture inside `test_api.py`. For `/v1/section`, a `title`/`address` test needs a model call. Do not add one. Code review covers the pass-through.

- [ ] **Step 2: RED → implement → GREEN; full Python gate.**

- [ ] **Step 3: Commit**

```bash
git add apps/worker
git commit -m "Carry the form of address and the seller's brand through the text API"
```

---

### Task 5: Migration `0010_pro_brand.sql` and the address snapshot

**Files:**
- Create: `apps/jobs/migrations/0010_pro_brand.sql`
- Modify: `apps/jobs/src/pro/readings.ts` (`createReading` writes `address`; `READING_SELECT` and `ReadingRow` gain `address`)
- Test: `apps/jobs/test/brand-schema.test.ts` (new); append one test to `apps/jobs/test/readings.test.ts`

**Interfaces:**
- `pro_brands(account_id PK → pro_accounts, name, contacts TEXT (JSON array), accent, intro, outro, signature, logo_key, photo_key, updated_at)`
- `pro_readings.address TEXT NOT NULL DEFAULT 'vy' CHECK (address IN ('vy','ty'))`
- `ReadingRow.address: 'vy' | 'ty'`

- [ ] **Step 1: Failing tests**

`apps/jobs/test/brand-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signIn, testEnv } from './env';

describe('0010 brand schema', () => {
  it('keeps one brand per seller with sane defaults', async () => {
    const { account } = await signIn('brand-schema@brand.test');
    await testEnv.DB.prepare('INSERT INTO pro_brands (account_id, name, updated_at) VALUES (?, ?, ?)')
      .bind(account.id, 'Мария', '2026-10-04T00:00:00.000Z')
      .run();
    const row = await testEnv.DB.prepare('SELECT contacts, accent, intro, logo_key FROM pro_brands WHERE account_id = ?')
      .bind(account.id)
      .first();
    expect(row).toEqual({ contacts: '[]', accent: '#E7B75C', intro: '', logo_key: null });
    await expect(
      testEnv.DB.prepare('INSERT INTO pro_brands (account_id, name, updated_at) VALUES (?, ?, ?)')
        .bind(account.id, 'Ещё', '2026-10-04T00:00:00.000Z')
        .run(),
    ).rejects.toThrow(/UNIQUE|PRIMARY/);
  });
});
```

Append to `readings.test.ts`, inside `describe('createReading', …)`:

```ts
  it("remembers the seller's form of address on the reading", async () => {
    const { account, clientId } = await seller('tone');
    await testEnv.DB.prepare("UPDATE pro_accounts SET tone = 'ty' WHERE id = ?").bind(account.id).run();
    const { id } = (await createReading(testEnv, { ...account, tone: 'ty' }, { product: 'natal', client_id: clientId })) as { id: string };
    await testEnv.DB.prepare("UPDATE pro_accounts SET tone = 'vy' WHERE id = ?").bind(account.id).run();
    expect((await readingRow(testEnv.DB, id, account.id))?.address).toBe('ty');
  });
```

- [ ] **Step 2: Migration**

```sql
-- Chronika Pro, phase 3: the seller's brand, and the form of address each reading was ordered in.
--
-- A brand is the seller's own presentation, not personal data about their clients: it is stored
-- in the clear. Images live in R2 under brand/<account_id>/; the row keeps their keys.

CREATE TABLE pro_brands (
  account_id TEXT PRIMARY KEY REFERENCES pro_accounts(id),
  name       TEXT NOT NULL,
  -- JSON array of up to four lines: a handle, a phone, a site.
  contacts   TEXT NOT NULL DEFAULT '[]',
  accent     TEXT NOT NULL DEFAULT '#E7B75C',
  intro      TEXT NOT NULL DEFAULT '',
  outro      TEXT NOT NULL DEFAULT '',
  signature  TEXT NOT NULL DEFAULT '',
  logo_key   TEXT,
  photo_key  TEXT,
  updated_at TEXT NOT NULL
);

-- «вы» or «ты», taken from the account when the reading is ordered, so a later change of mind
-- does not rewrite half a reading in the other form.
ALTER TABLE pro_readings ADD COLUMN address TEXT NOT NULL DEFAULT 'vy' CHECK (address IN ('vy','ty'));
```

- [ ] **Step 3: readings.ts**

- `createReading`'s `account` parameter type becomes `{ id: string; email: string; tone?: 'ty' | 'vy' }`.
- The `pro_readings` INSERT adds `address` = `account.tone ?? 'vy'`. Routes pass the full `ProAccount`, which has `tone`.
- `READING_SELECT` adds `r.address`, and `ReadingRow` gains `address: 'vy' | 'ty'`.

- [ ] **Step 4: Run both test files; full suite; tsc. Commit.**

```bash
git add apps/jobs/migrations/0010_pro_brand.sql apps/jobs/src/pro/readings.ts apps/jobs/test/brand-schema.test.ts apps/jobs/test/readings.test.ts
git commit -m "Keep the seller's brand, and the form of address each reading was ordered in"
```

---

### Task 6: Brand storage and routes (`src/pro/brand.ts`)

**Files:**
- Create: `apps/jobs/src/pro/brand.ts`
- Modify: `apps/jobs/src/pro/routes.ts`
- Test: `apps/jobs/test/brand.test.ts`

**Interfaces:**
- Produces:
  - `interface BrandInput { name: string; contacts: string[]; accent: string; intro: string; outro: string; signature: string }`
  - `parseBrand(raw: unknown): BrandInput | null`. Trims all strings; name 1–60; contacts ≤ 4 non-empty, each ≤ 80; accent `^#[0-9A-Fa-f]{6}$` (default `#E7B75C` when absent); intro/outro ≤ 3000; signature ≤ 80. Any violation → null.
  - `saveBrand(env, accountId, input): Promise<void>`: upsert, keeping image keys.
  - `getBrand(env, accountId): Promise<(BrandInput & { has_logo: boolean; has_photo: boolean }) | null>`
  - `type ImageKind = 'logo' | 'photo'`
  - `putBrandImage(env, accountId, kind, bytes: ArrayBuffer): Promise<'ok' | 'no_brand' | 'invalid'>`: PNG/JPEG by magic bytes, ≤ 1 048 576 bytes. Stores `brand/<accountId>/<kind>-<uuid>` with the right content type, points the row at it, and deletes the previous object.
  - `deleteBrandImage(env, accountId, kind): Promise<void>`
  - `brandImage(env, accountId, kind): Promise<{ body: ReadableStream; contentType: string } | null>`
  - `brandForDocument(env, accountId): Promise<DocumentBrand | null>`: the brand with `logo`/`photo` as base64 strings (or null). It is the exact JSON shape of the Python `Brand`.
  - `setTone(env, accountId, tone: 'vy' | 'ty'): Promise<void>`
- Routes (behind `x-pro-key` and a session):

| Route | Result |
|---|---|
| `GET /v1/pro/brand` | `{ brand, tone }`, where `brand` is null when unset |
| `PUT /v1/pro/brand` JSON `BrandInput` plus optional `tone` | 200 `{ ok: true }`; 400 `{ error: 'brand' }` or `{ error: 'tone' }` |
| `PUT /v1/pro/brand/logo` and `/photo`, raw body | 200; 400 `{ error: 'image' }`; 409 `{ error: 'no_brand' }` (save the brand first) |
| `GET` the same paths | image bytes with their content type, `cache-control: private, no-store`; 404 |
| `DELETE` the same paths | 200 |

- [ ] **Step 1: Failing tests**

`apps/jobs/test/brand.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createLoginToken } from '../src/pro/auth';
import { brandForDocument, parseBrand } from '../src/pro/brand';
import { testEnv } from './env';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

async function session(name: string) {
  const token = await createLoginToken(testEnv.DB, `${name}@brand.test`);
  const r = await SELF.fetch('https://jobs.test/v1/pro/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pro-key': 'test-pro-key' },
    body: JSON.stringify({ token }),
  });
  return ((await r.json()) as { session: string }).session;
}

const call = (method: string, path: string, s: string, body?: BodyInit, type = 'application/json') =>
  SELF.fetch(`https://jobs.test${path}`, {
    method,
    headers: { 'content-type': type, 'x-pro-key': 'test-pro-key', authorization: `Bearer ${s}` },
    body,
  });

const BRAND = { name: '  Мария Звёздная ', contacts: ['@maria'], accent: '#8E7CC3', intro: 'Привет', outro: '', signature: 'М.' };

describe('parseBrand', () => {
  it('trims and defaults', () => {
    expect(parseBrand({ name: ' X ' })).toEqual({ name: 'X', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' });
  });
  it('refuses what does not fit', () => {
    for (const bad of [{}, { name: '' }, { name: 'x'.repeat(61) }, { name: 'X', accent: 'red' }, { name: 'X', contacts: ['1', '2', '3', '4', '5'] }, { name: 'X', contacts: [''] }, { name: 'X', intro: 'x'.repeat(3001) }]) {
      expect(parseBrand(bad)).toBeNull();
    }
  });
});

describe('/v1/pro/brand', () => {
  it('saves a brand, its tone, its images, and builds the document brand', async () => {
    const s = await session('maria');
    expect(await (await call('GET', '/v1/pro/brand', s)).json()).toEqual({ brand: null, tone: 'vy' });
    expect((await call('PUT', '/v1/pro/brand/logo', s, PNG, 'image/png')).status).toBe(409);
    expect((await call('PUT', '/v1/pro/brand', s, JSON.stringify({ ...BRAND, tone: 'ty' }))).status).toBe(200);
    expect((await call('PUT', '/v1/pro/brand/logo', s, PNG, 'image/png')).status).toBe(200);
    expect((await call('PUT', '/v1/pro/brand/photo', s, JPEG, 'image/jpeg')).status).toBe(200);

    const got = (await (await call('GET', '/v1/pro/brand', s)).json()) as { brand: { name: string; has_logo: boolean }; tone: string };
    expect(got).toMatchObject({ tone: 'ty', brand: { name: 'Мария Звёздная', has_logo: true, has_photo: true } });
    const logo = await call('GET', '/v1/pro/brand/logo', s);
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await logo.arrayBuffer())).toEqual(PNG);

    const account = await testEnv.DB.prepare("SELECT id FROM pro_accounts WHERE email = 'maria@brand.test'").first<{ id: string }>();
    const doc = await brandForDocument(testEnv, account!.id);
    expect(doc).toMatchObject({ name: 'Мария Звёздная', contacts: ['@maria'], accent: '#8E7CC3' });
    expect(atob(doc!.logo!).charCodeAt(0)).toBe(0x89);
  });

  it('replaces an image and forgets the old object', async () => {
    const s = await session('replace');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    await call('PUT', '/v1/pro/brand/logo', s, PNG, 'image/png');
    const account = await testEnv.DB.prepare("SELECT id FROM pro_accounts WHERE email = 'replace@brand.test'").first<{ id: string }>();
    const first = await testEnv.DB.prepare('SELECT logo_key FROM pro_brands WHERE account_id = ?').bind(account!.id).first<{ logo_key: string }>();
    await call('PUT', '/v1/pro/brand/logo', s, JPEG, 'image/jpeg');
    expect(await testEnv.DOCS.get(first!.logo_key)).toBeNull();
    expect((await call('DELETE', '/v1/pro/brand/logo', s)).status).toBe(200);
    expect((await call('GET', '/v1/pro/brand/logo', s)).status).toBe(404);
  });

  it('refuses what is not a PNG or JPEG, or too large', async () => {
    const s = await session('refuse');
    await call('PUT', '/v1/pro/brand', s, JSON.stringify(BRAND));
    expect((await call('PUT', '/v1/pro/brand/logo', s, new TextEncoder().encode('GIF89a'), 'image/png')).status).toBe(400);
    const big = new Uint8Array(1_048_577);
    big.set(PNG);
    expect((await call('PUT', '/v1/pro/brand/logo', s, big, 'image/png')).status).toBe(400);
    expect((await call('GET', '/v1/pro/brand/logo', s)).status).toBe(404);
  });

  it('refuses a bad brand and a bad tone', async () => {
    const s = await session('badbrand');
    expect((await call('PUT', '/v1/pro/brand', s, JSON.stringify({ name: '' }))).status).toBe(400);
    expect((await call('PUT', '/v1/pro/brand', s, JSON.stringify({ ...BRAND, tone: 'они' }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement `brand.ts`**, following the interfaces and the style of `clients.ts`. Notes:
  - Magic bytes: PNG starts `89 50 4E 47 0D 0A 1A 0A` (content type `image/png`); JPEG starts `FF D8 FF` (`image/jpeg`). The request's content-type header is ignored; the bytes decide.
  - Dimensions: reject images wider or taller than 4000 px (the renderer refuses them too). PNG: width and height are big-endian uint32 at byte offsets 16 and 20 (IHDR). JPEG: walk the segments from offset 2 (each `FF xx` + 2-byte big-endian length) until a SOF marker (`C0`–`CF` except `C4`, `C8`, `CC`); height is the uint16 at segment offset +5, width at +7. A JPEG with no SOF counts as invalid. Add tests: a PNG header declaring 5000×10 → 400; a minimal JPEG with a SOF declaring 10×5000 → 400.
  - base64 for `brandForDocument`: encode in chunks (e.g. 32 KB slices through `String.fromCharCode(...slice)` then `btoa`), never a whole-MB spread.
  - `putBrandImage` reads the old key, `put`s the new object, updates the row, then deletes the old object. A crash leaves at worst an orphan, never a row pointing at nothing.
  - `PUT /v1/pro/brand` with `tone` present calls `setTone` only for `'vy'`/`'ty'`, else 400 `tone`. Without `tone`, the tone is left alone.
  - The routes read the raw body with `await request.arrayBuffer()`. Check `byteLength` before inspecting.

- [ ] **Step 3: Wire the routes** in `routes.ts` (a `brandRoutes(request, env, url, account)` function in the same style as `readingRoutes`, called right before it).

- [ ] **Step 4: Run the file; full suite; tsc. Commit.**

```bash
git add apps/jobs/src/pro/brand.ts apps/jobs/src/pro/routes.ts apps/jobs/test/brand.test.ts
git commit -m "Let a seller set their brand, their tone, their logo and photo"
```

---

### Task 7: Seller readings use their address form and their brand

**Files:**
- Modify: `apps/jobs/src/pipeline.ts`, `apps/jobs/src/pro/lifecycle.ts`, `apps/jobs/test/fakes.ts`, `apps/jobs/test/env.ts`
- Test: `apps/jobs/test/branding-pipeline.test.ts` (new); one test appended to `apps/jobs/test/assemble.test.ts`

**Interfaces:**
- `writeSection(env, kind, people, payload, sectionId, others, address: 'vy' | 'ty' = 'vy')` adds `address` to the `/v1/section` body.
- `calculate` adds `&address=<address>` to both `/v1/sections` URLs.
- `advance`'s order lookup (already `orders LEFT JOIN pro_readings`) also selects `r.address`. Seller jobs use it everywhere; B2C uses `'vy'`, and no `address` param needs to be sent for B2C, but sending `vy` is equivalent. Keep the B2C request bodies unchanged: **omit** `address` when it is `'vy'`.
- `render`: for a seller order, it fetches `brandForDocument(env, seller)` and adds `brand` and `address` to the `/v1/skeleton` body. `order_ref` stays as today; the API drops it when a brand is present (Task 4).
- `regenerateSection` passes `row.address` to `writeSection`.
- `AssembleResult` gains `'no_brand'`. `assemblePdf` returns it when `pro_brands` has no row for the seller (checked after ownership, before moving the job). Routes map it to 409 `{ error: 'no_brand' }` through the existing generic 409 branch.
- In the fakes, `/v1/section`, `/v1/sections` and `/v1/skeleton` remember the last request (body for POST, query for GET) under the key `"<path>|<name>"`. For `/v1/sections` the name is unknown, so it uses `"<path>|last"`. `GET /__last?key=…` returns it. Test helper `lastRequest(key: string): Promise<Record<string, unknown> | null>` in `test/env.ts`.

- [ ] **Step 1: Failing tests**

`apps/jobs/test/branding-pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { saveBrand } from '../src/pro/brand';
import { assemblePdf, regenerateSection } from '../src/pro/lifecycle';
import { lastRequest, runJob, testEnv } from './env';
import { readingFor, seedOrder } from './seed';

const BRAND = { name: 'Мария', contacts: ['@maria'], accent: '#8E7CC3', intro: '', outro: '', signature: '' };

describe('seller readings', () => {
  it('are written in the form of address the reading was ordered in', async () => {
    const r = await readingFor('Тыкает');
    await testEnv.DB.prepare("UPDATE pro_readings SET address = 'ty' WHERE order_id = ?").bind(r.id).run();
    await runJob(r.jobId);
    expect((await lastRequest('/v1/section|Тыкает'))?.address).toBe('ty');

    await testEnv.DB.prepare("UPDATE pro_accounts SET tone = 'vy' WHERE id = ?").bind(r.account.id).run();
    await regenerateSection(testEnv, r.account.id, r.id, 'a');
    expect((await lastRequest('/v1/section|Тыкает'))?.address).toBe('ty');
  });

  it('are assembled with the seller brand, and never without one', async () => {
    const r = await readingFor('Бренд');
    await runJob(r.jobId);
    expect(await assemblePdf(testEnv, r.account.id, r.id)).toBe('no_brand');
    await saveBrand(testEnv, r.account.id, BRAND);
    expect(await assemblePdf(testEnv, r.account.id, r.id)).toBe('queued');
    await runJob(r.jobId);
    const skeleton = await lastRequest('/v1/skeleton|Бренд');
    expect(skeleton?.brand).toMatchObject({ name: 'Мария', accent: '#8E7CC3' });
  });

  it("leave a shopper's requests exactly as they were", async () => {
    const { jobId } = await seedOrder({ pro: false, name: 'Покупатель Б' });
    await runJob(jobId);
    expect(await lastRequest('/v1/section|Покупатель Б')).not.toHaveProperty('address');
    const skeleton = await lastRequest('/v1/skeleton|Покупатель Б');
    expect(skeleton).not.toHaveProperty('brand');
    expect(skeleton).not.toHaveProperty('address');
  });
});
```

Append to `assemble.test.ts`. Its existing tests call `assemblePdf` for sellers without a brand. Add `await saveBrand(testEnv, account.id, { name: 'Тест', contacts: [], accent: '#E7B75C', intro: '', outro: '', signature: '' })` to each existing test **before** its first `assemblePdf` call, so they keep testing what they tested. Do the same in `regenerate.test.ts` and `routes-readings.test.ts` wherever a seller assembles a PDF. For the HTTP flow, add a `PUT /v1/pro/brand` call.

- [ ] **Step 2: Fakes and helper.** In `test/fakes.ts`:
  - add `const lastSeen = new Map<string, unknown>()`;
  - record into it in the `/v1/section`, `/v1/sections` and `/v1/skeleton` handlers (sections: `Object.fromEntries(new URL(request.url).searchParams)`);
  - add a `GET /__last` handler returning `json(lastSeen.get(key) ?? null)`.

  In `test/env.ts`, `lastRequest(key)` fetches `https://api.test/__last?key=${encodeURIComponent(key)}`. Reading the body twice: parse it once into a variable, then both record it and use it.

- [ ] **Step 3: Implement the pipeline and lifecycle changes** listed under Interfaces. `brandForDocument` comes from `./pro/brand`. Watch for an import cycle (`pro/brand.ts` must not import `pipeline.ts`).

- [ ] **Step 4: Run the new file and the touched files; full suite; tsc. Commit.**

```bash
git add apps/jobs/src apps/jobs/test
git commit -m "Write a seller's readings in their form of address, and assemble them under their brand"
```

---

### Task 8: Record Phase 3 in the spec

**Files:** Modify `docs/chronika-pro/SPEC.md`.

- [ ] **Step 1:** Under `## Product`, replace the branding bullet's second sentence with: "Logo or name on the cover, accent colour on the cover and section labels, an «От автора» page (photo, intro, signature) when filled in, a closing block (outro, signature, contacts), PDF author = the seller. No order reference, domain or name of ours anywhere. A PDF cannot be assembled until the brand has a name." Then add: "**Tone** is snapshotted on each reading when it is ordered."

- [ ] **Step 2:** Under `## Operations`, add: "Phase 3: apply migration `0010_pro_brand.sql` (a production write) before deploying the jobs worker; deploy the API container (worker + document + texts) before the jobs worker, since the jobs worker sends `address` and `brand` the old container would reject."

- [ ] **Step 3: Commit**

```bash
git add docs/chronika-pro/SPEC.md
git commit -m "Write down how a seller's brand and tone reach their readings"
```

---

## Self-review notes

**Spec coverage:**

| Spec item | Task |
|---|---|
| Logo / name, contacts, photo, signature, intro / outro, accent | 2, 3, 6, 7 |
| No mention of us (content, metadata, filename) | 2, 4 |
| Disclaimer kept (it never named us) | — |
| «ты/вы» prompts, validation, titles | 1, 4, 7 |
| Brand storage and images in R2 | 5, 6 |
| B2C unchanged (prompt byte-identity, renderer without brand, request bodies) | 1, 2, 7 |

**Known limits, accepted:**
- An accent colour too dark for the dark cover is accepted. The cabinet (Phase 5) should preview the cover.
- Brand images are embedded as given, with no resizing. 1 MB is the cap.
