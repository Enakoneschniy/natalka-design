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
  by the seller, one accent colour (replaces our gold). Assets in R2. Logo or name on the cover,
  accent colour on the cover and section labels, an «От автора» page (photo, intro, signature)
  when filled in, a closing block (outro, signature, contacts), PDF author = the seller. No order
  reference, domain or name of ours anywhere. One mandatory line at the end: a short
  "for entertainment / self-reflection" disclaimer without our name. A PDF cannot be assembled
  until the brand has a name.
- **Tone** per account: «ты» / «вы» — passed to the text prompts. Tone is snapshotted on each
  reading when it is ordered.
- **Astrology settings**: none. Placidus only. Requests are logged, not built.
- Same text methodology as B2C; the model words each reading afresh.
- **Report a problem** button on a section (stores section + comment in D1, alerts the existing
  Telegram alert channel) and a support email.

## Money

- Prepaid **credit packs**, Stripe Checkout in the cabinet, **EUR**, Stripe Tax on, optional VAT ID:
  **10 credits — €99 · 30 — €249 · 100 — €690**.
- Weights: **bundle = 2 credits**, every other product = 1.
- **Credits never expire.**
- Credits are spent when a reading is ordered. If nothing at all could be written, they come back
  automatically. If some sections were written, the reading is delivered and the missing sections
  are written free on request (not counted in the 10 rewrites).
- Money back only within 14 days of purchase and only if no credit of that pack was spent.
- Variable cost per reading ≈ €0.2–0.6 (LLM), regeneration of a section ≈ €0.01–0.03.
- If `STRIPE_SECRET_KEY` is not configured, pack purchases return 503 and are unavailable;
  there are no free test purchases (unlike the B2C channel).
- Refunds are initiated by the owner in the Stripe dashboard. The system marks the purchase
  refunded, takes the credits back via the ledger (negative adjustment), and may result in a
  negative balance. `refundable` eligibility (≤14 days, unspent credits) is shown as advisory,
  not enforced.

## Access

- **Open sign-up** by email magic link — our own implementation (signed tokens; no auth
  libraries). Mail from `chronika.me` via Resend.
- **3 trial credits only with an invite code** from the marketer; without one, a demo reading on a
  sample chart under the seller's brand.
- The invite code is also where a seller came from (no commission accounting).
- **Demo**: one pre-generated sample reading (var `PRO_DEMO_ORDER_ID`) that every signed-in seller
  can open; it replaces trial credits for sellers without an invite code.

## Data

- Client birth data is kept **while the seller's account is active**, AES-GCM like B2C, with a
  delete button. Not the B2C 30-day rule.
- On creating a client the seller confirms **"I have my client's consent"**.
- We are the processor, the seller the controller. Terms: **resale licence** (seller may present
  the reading as their own work) + data-processing terms. Drafted by us, reviewed by a lawyer.
- **Readings**: texts are kept for as long as the client is (`jobs.payload`); the PDF lives 30 days
  and is re-assembled on demand. Deleting a client deletes every reading they appear in, as client
  or synastry partner, with its charts and PDFs. The credit ledger keeps its rows.
- A synastry partner is a client in the seller's base like any other.
- A shopper's job payload (calculated chart + texts) is cleared after `RETENTION_DAYS`, with the
  charts and the PDF — as the ready letter promises.

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

## Operations

Phase 1 deploy, done by the owner. Run the steps in this order: deploying before the migration
breaks the nightly sweep.

1. Session secret, a fresh random value that is never the same as `LINK_KEY`:
   `openssl rand -base64 48 | pnpm --filter @natalka/jobs exec wrangler secret put SESSION_KEY`
2. Shared key for `/v1/pro/*`, a fresh random value of its own. The pro site's server will need the
   same value in Phase 5:
   `openssl rand -base64 48 | pnpm --filter @natalka/jobs exec wrangler secret put PRO_API_KEY`
3. Remote migration (a production write): `pnpm --filter @natalka/jobs migrate`
4. Deploy: `pnpm --filter @natalka/jobs deploy`
5. Invite code for the marketer (until /admin exists) (a production write):
   ```bash
   pnpm --filter @natalka/jobs exec wrangler d1 execute natalka --remote --command \
     "INSERT INTO pro_invite_codes (code, credits, max_uses, note, created_at)
      VALUES ('START3', 3, 50, 'marketer pilot', strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
   ```

Phase 2: apply migration `0009_pro_readings.sql` (`pnpm --filter @natalka/jobs migrate`, a
production write) **before** deploying the worker — the nightly sweep reads `orders.pro_account_id`.
Demo: once the cabinet exists, order a natal reading for a sample chart of a fictional person (the section texts address the client by name, and every seller will read them) from the owner's seller
account, then set `PRO_DEMO_ORDER_ID` to its id in `apps/jobs/wrangler.jsonc` vars and deploy.

Phase 3: apply migration `0010_pro_brand.sql` (a production write) before deploying the jobs
worker. Deploy the API container (worker + document + texts) before the jobs worker. An old
container would not reject the `address` and `brand` the new jobs worker sends: it would drop them
and assemble the reading under our name. The jobs worker refuses to store a seller's PDF whose
document came back without the brand, so a skew fails the assembly instead of shipping it, and
from this phase on the container refuses fields it does not know. New jobs worker routes
for the brand (`/v1/pro/brand`, `/v1/pro/brand/logo|photo`) need no extra configuration. Images
are limited to PNG/JPEG ≤ 1 MB and ≤ 4000 px per side.

Phase 4: apply migration `0011_pro_purchases.sql` (a production write) before deploying
the jobs worker. In the Stripe dashboard, enable these webhook endpoint events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `charge.refunded`. A pack whose amount does not match is marked failed
and logged ("pro pack amount mismatch"); the owner refunds it in Stripe.
Stripe Tax requires `STRIPE_TAX=1`. Packs are priced inline in EUR minor units.

Phase 5a: apply migration `0012_pro_signup.sql` (a production write), and deploy the jobs worker
before the web app. Set the web secret `PRO_API_KEY` to the same value as the jobs worker's
(`pnpm --filter @natalka/web exec wrangler secret put PRO_API_KEY`). Deploying the web app creates
the `pro.chronika.me` custom domain; the jobs var `PRO_SITE_URL` is already
`https://pro.chronika.me`, which is where the letters' `/login/<token>` links point. Local
try-out: run `apps/web` with `PRO_HOSTS=astro:3000` to see the cabinet at that host, and set
`NATALKA_JOBS_URL` to a jobs dev instance and `PRO_API_KEY` to its key. Without a mail key the
jobs worker logs the link (dev only). The session cookie is `Secure`, so a local try-out needs https or a
`localhost` host: browsers keep Secure cookies on `http://localhost` but drop them on any other
plain-http host such as `astro:3000`, where sign-in would seem to succeed and land back on the
sign-in page. Use `PRO_HOSTS=localhost:3000` and open `http://localhost:3000`.
