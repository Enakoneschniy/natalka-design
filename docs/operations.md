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
| `EXPERIMENT_KEY` | natalka-web | signs the price-experiment cookie |
| `DATA_KEY`, `LINK_KEY`, `SESSION_KEY` | natalka-jobs | encryption at rest, link tokens, cabinet sessions (three different values) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` | natalka-jobs | the providers |
| `NATALKA_MODEL_API_KEY` (still read under its old name `NATALKA_ANTHROPIC_API_KEY`), `NATALKA_AI_GATEWAY_TOKEN` | natalka-api | the model provider; the AI Gateway's run token |
| `TELEGRAM_BOT_TOKEN`, `SETUP_KEY` | natalka-bot | the bot; `SETUP_KEY` only while re-pointing the webhook |

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
