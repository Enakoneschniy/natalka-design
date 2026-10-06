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
- One section of a reading is written at a time: while a rewrite (or a missing section) is with
  the model, another request for that reading is answered «busy» (409) without calling it. A
  reading's PDF can be assembled at most 10 times an hour.
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
  Telegram alert channel) and a support email. At most 20 reports an hour per seller.

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
- A seller with 3 checkouts from the last hour still unpaid is not given a fourth (429) until one
  is paid, expires or is an hour old.
- Refunds are initiated by the owner in the Stripe dashboard. The system marks the purchase
  refunded, takes the credits back via the ledger (negative adjustment), and may result in a
  negative balance. `refundable` eligibility (≤14 days, unspent credits) is shown as advisory,
  not enforced.
- A disputed pack payment takes the pack's credits back while the dispute is open; a dispute won,
  or a bank inquiry closed, gives them back. A payment's credits are taken back once, whether a
  dispute or a refund comes first, and nothing is given back once the payment is refunded.

## Access

- **Open sign-up** by email magic link — our own implementation (signed tokens; no auth
  libraries). Mail from `chronika.me` via Resend.
- A sign-in or sign-up request is answered `202` at once, whatever the address; the letter follows.
  An address gets at most 5 links an hour from one requester (the visitor's address as the pro
  site saw it, passed as `x-client-ip` and kept only as a keyed hash; an IPv6 address counts by its
  /64) and 20 an hour in all. A link works once, for 15 minutes, and only by POST; the confirm page
  shows whose cabinet it opens (`ye***@gmail.com`) without spending it.
- The session lives in the cookie `__Host-chp_session` (Secure, HttpOnly, SameSite=Lax, Path=/);
  the old name `chp_session` is still read until it is removed. «Выйти» ends every session of the
  account.
- **3 trial credits only with an invite code** from the marketer; without one, a demo reading on a
  sample chart under the seller's brand.
- Invite codes are random and single-use, one per seller (`CHR-XXXX-XXXX`), made by the owner. A
  seller who tries 5 codes that do not work in an hour is refused for the rest of it.
- The invite code is also where a seller came from (no commission accounting).
- **Demo**: one pre-generated sample reading (var `PRO_DEMO_ORDER_ID`) that every signed-in seller
  can open; it replaces trial credits for sellers without an invite code.

## Data

- Client birth data is kept **while the seller's account is active**, AES-GCM like B2C, with a
  delete button. Not the B2C 30-day rule.
- On creating a client the seller confirms **"I have my client's consent"**.
- We are the processor, the seller the controller. Terms: **resale licence** (seller may present
  the reading as their own work) + data-processing terms. Drafted by us, reviewed by a lawyer.
- **Readings**: texts are kept for as long as the client is (the job's payload, encrypted like the
  birth data); the PDF lives 30 days and is re-assembled on demand. Deleting a client deletes every
  reading they appear in, as client or synastry partner, with its charts and every file in its
  storage folder. The credit ledger keeps its rows.
- A synastry partner is a client in the seller's base like any other.
- **Closing the cabinet** (page «Аккаунт», «Закрыть кабинет», confirmed by typing the address)
  deletes every client and reading with their files, the brand and its pictures, and the address's
  sign-in links, and ends every session. The ledger, the purchases and the invite redemption stay
  for accounting; the account row keeps only what they need (address `closed-<id>@invalid`, no
  name, `closed_at`). A closed cabinet is never signed in to again; the same address can register
  anew.
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
5. Invite codes for the marketer (until /admin exists), one per seller: random, single-use, in the
   form `CHR-XXXX-XXXX` (a production write; run once per code):
   ```bash
   part() { LC_ALL=C tr -dc 'A-HJ-NP-Z2-9' </dev/urandom | head -c 4; }
   code="CHR-$(part)-$(part)"
   pnpm --filter @natalka/jobs exec wrangler d1 execute natalka --remote --command \
     "INSERT INTO pro_invite_codes (code, credits, max_uses, note, created_at)
      VALUES ('$code', 3, 1, 'marketer pilot', strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
   echo "$code"
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
jobs worker logs the link (dev only, with `MAIL_LOG_LINKS=1`). The session cookie is
`__Host-chp_session`, which is `Secure`, so a local try-out needs https or a `localhost` host:
browsers keep Secure cookies on `http://localhost` but drop them on any other plain-http host such
as `astro:3000`, where sign-in would seem to succeed and land back on the sign-in page. Use
`PRO_HOSTS=localhost:3000` and open `http://localhost:3000`.

Phase 5b: to look at the cabinet without a jobs worker, start the fake one,
`node apps/web/scripts/fake-pro-jobs.mjs` (port 8799, no dependencies, in-memory, reset on
restart), and run `apps/web` with `NATALKA_JOBS_URL=http://localhost:8799 PRO_API_KEY=dev
PRO_HOSTS=localhost:3000`. It accepts any `x-pro-key`, any bearer and any sign-in token, and it
answers every `/v1/pro/*` call the cabinet makes with a seller holding 12 credits, three clients,
readings in every state (one being written gains a section on each look), a brand and a few
purchases. A bought pack's checkout link leads back to `/credits?purchase=<id>` and is paid
seven seconds later; the invite code listed in the script adds 3 credits. Sign in by asking for a
link with any address and opening `/login/<anything>`. The fake exists only for visual checks: it
never runs anywhere but a dev box. For screenshots from another container (the Playwright server),
add that host to `PRO_HOSTS` (e.g. `astro:3005`) and set the session through the browser context
instead of signing in, under the old name `chp_session` (still read): a plain-http non-localhost
host drops the Secure `__Host-chp_session`.

### Release of October 2026: keys between the services, limits, closing a cabinet

Done by the owner, in this order. Every key is a fresh random value made for this one purpose;
the commands pipe it into `wrangler secret put`, so it is never shown or pasted.

1. Secrets:
   - `SITE_KEY`, one value on the web app and on the jobs worker. The site's server sends it on
     every call to the jobs worker; the jobs worker serves nothing without it but `/health`, the
     Stripe webhook (signed by Stripe) and `/v1/pro/*` (which keeps `PRO_API_KEY`).
     ```bash
     key=$(openssl rand -base64 48)
     printf %s "$key" | pnpm --filter @natalka/web exec wrangler secret put SITE_KEY
     printf %s "$key" | pnpm --filter @natalka/jobs exec wrangler secret put SITE_KEY
     unset key
     ```
   - `NATALKA_API_KEY` on the jobs worker and `ACCESS_KEY` on the API edge, one value. The jobs
     worker sends it on every call to the text-and-document API; the edge answers nothing without
     it but its two health checks.
     ```bash
     key=$(openssl rand -base64 48)
     printf %s "$key" | pnpm --filter @natalka/jobs exec wrangler secret put NATALKA_API_KEY
     printf %s "$key" | pnpm --filter @natalka/api-edge exec wrangler secret put ACCESS_KEY
     unset key
     ```
   - `PREVIEW_KEY` on the web app alone, at least 32 characters: the preview page signs what it
     shows with it, and the preview route checks the signature.
     `openssl rand -base64 48 | pnpm --filter @natalka/web exec wrangler secret put PREVIEW_KEY`
2. The dead-letter queue the jobs worker now consumes:
   `pnpm --filter @natalka/jobs exec wrangler queues create natalka-jobs-dlq`
3. Migrations `0014` to `0023` (a production write). All are additive and safe while the current
   worker runs: `pnpm --filter @natalka/jobs migrate`
4. Deploy the web app, then the jobs worker, then the API edge with its container. Each one sends
   its key before the next one starts asking for it. Between the web app and the jobs worker, the
   sign-in confirm page does not say whose cabinet a link opens and «Закрыть кабинет» reports a
   failure; both work once the jobs worker is deployed.
5. Stripe dashboard, the webhook endpoint's events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`,
   `charge.dispute.closed`.
6. Invite codes from now on are made one per seller as in Phase 1, step 5. A shared code made
   before is ended by setting its `expires_at` to the current time.
