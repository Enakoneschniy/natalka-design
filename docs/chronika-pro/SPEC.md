# Chronika Pro — spec

Decided with the owner on 2026-10-03 (grilling session). Treat as fixed; changes go through the owner.

## What it is

A cabinet on **pro.chronika.me** where anyone who sells astrological readings — practising
astrologers, Instagram sellers, bloggers, coaches — produces our readings under **their own
brand** and resells them however they like. A parallel sales channel next to the B2C site
(chronika.me, live). Partner-marketer brings sellers and makes creatives; the system does not track
his share.

**Pilot goal:** 5–10 paying sellers and €300–500/month, judged 3 months after the first paying
seller. **Pilot language:** Russian only, same markets as B2C (never RU).

## Product

- Seller enters a client's birth data → the reading is written → shown **in the browser by
  section** → seller may **regenerate a section** (10 times per reading, within 14 days of
  creation; then the reading is frozen) → **assemble PDF** (re-assemble after regenerating) →
  seller downloads and delivers it themselves. We send nothing to the seller's client.
- All five products: natal, forecast, synastry, child, bundle.
- **Client base**: saved clients, new readings for an existing client.
- **Branding in the PDF**: logo, name, contacts, photo, signature, intro and closing text written
  by the seller, one accent colour (replaces our gold). Assets in R2. **No mention of us
  anywhere** in the PDF (content, metadata, file name). One mandatory line at the end: a short
  "for entertainment / self-reflection" disclaimer without our name.
- **Tone** per account: «ты» / «вы» — passed to the text prompts.
- **Astrology settings**: none. Placidus only. Requests are logged, not built.
- Same text methodology as B2C; the model words each reading afresh.
- **Report a problem** button on a section (stores section + comment in D1, alerts the existing
  Telegram alert channel) and a support email.

## Money

- Prepaid **credit packs**, Stripe Checkout in the cabinet, **EUR**, Stripe Tax on, optional VAT ID:
  **10 credits — €99 · 30 — €249 · 100 — €690**.
- Weights: **bundle = 2 credits**, every other product = 1.
- **Credits never expire.**
- A failed generation **returns its credits automatically**.
- Money back only within 14 days of purchase and only if no credit of that pack was spent.
- Variable cost per reading ≈ €0.2–0.6 (LLM), regeneration of a section ≈ €0.01–0.03.

## Access

- **Open sign-up** by email magic link — our own implementation (signed tokens; no auth
  libraries). Mail from `chronika.me` via Resend.
- **3 trial credits only with an invite code** from the marketer; without one, a demo reading on a
  sample chart under the seller's brand.
- The invite code is also where a seller came from (no commission accounting).

## Data

- Client birth data is kept **while the seller's account is active**, AES-GCM like B2C, with a
  delete button. Not the B2C 30-day rule.
- On creating a client the seller confirms **"I have my client's consent"**.
- We are the processor, the seller the controller. Terms: **resale licence** (seller may present
  the reading as their own work) + data-processing terms. Drafted by us, reviewed by a lawyer.

## Architecture

- `pro.chronika.me` is the same `apps/web` with **Host-based routing** into a `(pro)` route group.
- API: new routes in `apps/jobs` under `/v1/pro/*`, same D1, same pipeline.
- Schema: `orders` / `jobs` gain `pro_account_id` (null = B2C). New tables for accounts, login
  tokens, invite codes, an **append-only credit ledger** (balance = sum), clients, brand assets.
- `/admin` on pro.chronika.me behind **Cloudflare Access** (owner + marketer): onboarding, invite
  codes, manual credit adjustments, funnel.
- Cabinet design: the B2C dark tokens, **calm** (no intro animation), **mobile first** (Z Fold
  included). Landing on pro.chronika.me in the full B2C "wow" style with a sample branded PDF.
- Funnel: sign-up → invite redeemed → first reading → first purchase → repeat purchase, plus
  weekly revenue — own `stats` counters and an `/admin` page. No external analytics.

## Deferred

Section text editor · branded horoscope mailing for the seller's audience · seller domains and
mail from the seller's name · house systems and orbs · other languages.

## Roadmap

Each phase ships working, tested software on its own.

| # | Phase | Delivers |
|---|---|---|
| 1 | **Accounts & credits API** | Migration, magic-link login, sessions, credit ledger, invite codes, `/v1/pro` routes, test harness for `apps/jobs`. |
| 2 | **Readings for sellers** | Clients (encrypted, consent, delete), create reading = spend credits, pipeline stops after texts for pro, section view, regenerate with limits, assemble PDF, refund on failure, retention exemption. |
| 3 | **Branded PDF** | `packages/document` brand parameters (logo, photo, contacts, colour, intro/outro, disclaimer, no-us metadata), tone in `packages/texts`, R2 uploads. |
| 4 | **Credit packs** | Stripe Checkout for packs, webhook → ledger, refunds policy. |
| 5 | **Cabinet UI** | Host routing, login pages (POST-only consumption), clients, readings, brand settings, buy credits, report a problem. |
| 6 | **Admin, landing, launch** | `/admin` behind Access, invite codes UI, funnel page, landing, legal drafts. |
