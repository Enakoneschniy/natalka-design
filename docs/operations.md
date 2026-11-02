# Operations

What runs outside the code: the settings, secrets and rules that live in Cloudflare and GitHub,
and the order in which a release goes out. Account-specific values (ids, hostnames) are in the
wrangler configs; secret values are never written down anywhere.

## Secrets

Set with `wrangler secret put <NAME>` in the app's directory, from a generated value
(`openssl rand -base64 48`), never typed or pasted into a file in the repository.

| Secret | Where | Pairs with |
|---|---|---|
| `SITE_KEY` | natalka-web, natalka-jobs | the same value on both: the site's key for every jobs route |
| `PRO_API_KEY` | natalka-web, natalka-jobs | the same value on both: the cabinet's key for `/v1/pro/*` |
| `NATALKA_API_KEY` / `ACCESS_KEY` | natalka-jobs / natalka-api | the same value: jobs' key for the text and document API |
| `PREVIEW_KEY` | natalka-web | signs the preview facts a page renders |
| `DATA_KEY`, `LINK_KEY`, `SESSION_KEY` | natalka-jobs | encryption at rest, link tokens, cabinet sessions (three different values) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` | natalka-jobs | the providers |
| `NATALKA_MODEL_API_KEY` (in production still under its old name `NATALKA_ANTHROPIC_API_KEY` — an OpenRouter key despite the name), `NATALKA_AI_GATEWAY_TOKEN` | natalka-api | OpenRouter, the route to the model when `ANTHROPIC_API_KEY` is not set; the AI Gateway's run token |
| `ANTHROPIC_API_KEY` | natalka-api | the owner's own Anthropic key: the model is called directly and OpenRouter not at all (see below); created in console.anthropic.com, not with openssl |
| `TELEGRAM_BOT_TOKEN`, `SETUP_KEY` | natalka-bot | the bot; `SETUP_KEY` only while re-pointing the webhook |
| `META_CAPI_TOKEN` | natalka-jobs | Meta's Conversions API; generated in Events Manager, not with openssl (see below) |
| `TEST_ORDER_KEY` | natalka-jobs | makes an order sent with the same value as `x-test-order` a free test order: written, rendered and delivered, never charged or reported. The site's `/api/orders` passes the header on; set 2026-11-02 to check the German reading |

A route whose key is missing answers 503 rather than running unprotected. To rotate a pair, put
the new value on the caller and the callee one right after the other.

## Release order

1. `wrangler d1 time-travel info natalka` — note the bookmark first.
2. `pnpm --filter @natalka/jobs migrate` — migrations only add columns, tables and indexes, so the
   running worker keeps working while they apply.
3. New secrets, if the release adds any.
4. Deploy natalka-web, then natalka-jobs right after it, then the bot.
5. Push to `main`: CI tests everything, and the container workflow builds the API image and
   deploys natalka-api with it. Push only after jobs is live when the API's contract changed.

The jobs worker rolls forward only: rows it has encrypted cannot be read by an older build.

The Meta Conversions API (2026-10-28) is jobs-first as well: migration `0024_order_browser`, then
natalka-jobs (with `META_CAPI_TOKEN`), then natalka-web, which starts sending the browser and
calling `/v1/conversions/view`. Setting `META_PIXEL_ID` on the web also turns the cookie banner
on: it is shown whenever any advertising tag is configured.

A release in which the web starts sending something the worker must act on goes the other way:
jobs first, then web. The Ukrainian cabinet (2026-10-18) is one: an older worker ignores the
reading's `lang` and would charge for a Russian reading the seller ordered in Ukrainian. Its order
is: push `main` (the API container brings the texts check that knows «твій»), then natalka-jobs,
then natalka-web. No migration.

## Prices and the offer

The price test ended on 2026-11-02: the bundle costs €35 in the eurozone (its higher figure) and
the table's price elsewhere. `EXPERIMENT_KEY` on natalka-web is no longer read
(`wrangler secret delete EXPERIMENT_KEY` in `apps/web`), and the middleware takes back the `cx`
cookie from anyone still carrying it.

The offer — −50% on the bundle to the end of 7 November, CET — is `OFFER` in
`apps/web/src/lib/pricing.ts`. It ends by itself: no release is needed for the full price to come
back. Another offer is a new `percent` and `ends` there, and a release of natalka-web.

Promo codes are `CODES` in `apps/web/src/lib/promo.ts`: a code (letters and digits, 3–16), a
percent, the first moment it applies and the first moment it no longer does, and where it was
given out. A new code is an entry there and a release of natalka-web. A visitor brings it in a
link (`https://chronika.me/ru?code=XMAS30`, kept in the `chr_promo` cookie until the code ends) or
types it on the order screen. The larger of the offer and the code applies; they do not add up.
The order keeps the code it was priced with in `orders.variant`, so sales per code are
`SELECT variant, COUNT(*) FROM orders WHERE status = 'paid' GROUP BY variant`.

## The model

Texts are written by `claude-sonnet-5`, reached through the AI Gateway `natalka` by one route at
a time. With `ANTHROPIC_API_KEY` set on natalka-api (since 2026-11-02) the container calls
Anthropic directly, on the owner's API credits, through the gateway's `/anthropic` route
(`NATALKA_ANTHROPIC_BASE_URL` in `apps/api-edge/wrangler.jsonc`), and OpenRouter is not called at
all: the privacy policy and the seller offer name Anthropic alone. Without that secret OpenRouter
is the route, as before.

- **Switching on.** `wrangler secret put ANTHROPIC_API_KEY` in `apps/api-edge`, pasting the key at
  the prompt. The container reads its environment when it starts: instances already running keep
  the old route until they are replaced (or until the next deploy of natalka-api).
- **Credits.** There is no backup: when the credits run out every reading, preview and horoscope
  fails until they are topped up. Switching back to OpenRouter is
  `wrangler secret delete ANTHROPIC_API_KEY` — and the privacy policy and the seller offer then
  name OpenRouter again.
- **Cost.** Anthropic reports no price with a call; `cost_micros` for those calls comes from
  `PRICES` in `packages/texts/src/natalka_texts/providers.py`.

## Meta Conversions API

The jobs worker reports four events to Meta's dataset `META_PIXEL_ID` (a var in both wrangler
configs; the site's pixel uses the same id): `ViewContent` (a visitor's own preview),
`InitiateCheckout` (an order going to Stripe), `Purchase` (the webhook settled it) and
`StartTrial` (a subscription confirmed). Only for a visitor whose `chr_consent` cookie says
`granted`; what each event carries is in `apps/jobs/src/meta.ts` and in the privacy policy, and
the two change together. Nothing about the birth ever goes.

- **Token.** Events Manager → the dataset → Settings → Conversions API → *Generate access token*.
  Then `wrangler secret put META_CAPI_TOKEN` in `apps/jobs`, pasting the token at the prompt.
  Without it nothing is reported and no browser is kept with an order.
- **Checking.** Events Manager → *Test events* gives a code; `wrangler secret put
  META_TEST_EVENT_CODE` with it sends every event there instead of counting it. Open your own
  preview with cookies allowed and watch `ViewContent` arrive. Delete the secret afterwards
  (`wrangler secret delete META_TEST_EVENT_CODE`) — while it is set, real sales are not counted.
  A Purchase cannot be checked without paying: Stripe is live.
- **Failures** are logged by the jobs worker as `meta event refused <event> <id> <status> <code>`;
  code 190 is the token (expired or revoked), 100 a parameter.
- **Dedup.** Event ids are `checkout-<order>`, `purchase-<order>`, `trial-<subscription>`: a
  repeated webhook reports once. The pixel itself only sends `PageView`, so nothing overlaps.

## Cloudflare settings

- **Zone chronika.me**: Always Use HTTPS on; minimum TLS 1.2; HSTS one year without
  `includeSubDomains` (the mail subdomains are not proxied).
- **Rate limiting rule** (zone, `http_ratelimit` phase): POST requests to `/api/*` — 20 per
  10 seconds per address, then blocked for 10 seconds. This is the firm limit; the worker's own
  rate-limit bindings are approximate.
- **Workers**: preview URLs are off for every worker (each config says `"preview_urls": false`).
  natalka-jobs, natalka-api and natalka-bot keep their workers.dev hosts — Stripe's webhook, the
  container's health check and Telegram's webhook use them — and every route there checks a key or
  a signature.
- **AI Gateway `natalka`**: authentication on (the container sends `NATALKA_AI_GATEWAY_TOKEN`, an
  account token with the single permission "AI Gateway Run"); request logs off, because prompts
  carry names.
- **Stripe webhook events**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
  `charge.dispute.created`, `charge.dispute.closed`.

## GitHub settings

Secret scanning with push protection, Dependabot alerts and security updates, private
vulnerability reporting, and `main` protected against force-push and deletion. The container
workflow deploys from `main` only, in the `production` environment.

## Alerts

The jobs worker emails `ALERT_EMAIL` when a paid order cannot be produced, a payment does not
match its order, or a payment is disputed. The letters carry ids and codes only.
