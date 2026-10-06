# Security policy

Chronika — the shop at chronika.me and the Pro cabinet at pro.chronika.me — runs on the code in
this repository. The repository is public.

## Reporting a vulnerability

Email **help@chronika.me** with "Security" in the subject line. Please do not open a public
issue, pull request or discussion for it.

A useful report says:

- what is affected — a URL, an endpoint or a file in this repository;
- how to reproduce it, with the requests you sent;
- what an attacker gains;
- whether you saw, kept or passed on anyone else's data.

We confirm that the report arrived, keep you posted while we work on it and tell you when the fix
is live. Please give us a reasonable time to fix the problem before you talk about it publicly.

There is no bug bounty: reports are not paid.

## Scope

In scope:

- chronika.me and pro.chronika.me, including the order, preview, download, subscription and
  sign-in flows and the APIs behind them;
- the Cloudflare Workers and the container built from this repository: `apps/web`, `apps/jobs`,
  `apps/api-edge` with `apps/worker`, and the Telegram bot in `apps/bot`;
- secrets or personal data in this repository.

Out of scope:

- the third-party services we use (Cloudflare, Stripe, Resend, Telegram, the model provider) —
  please report to them;
- the public ephemeris service, which has its own repository;
- the static design mockups in `design/`, which hold sample data only;
- denial of service, load or volume testing, spam, social engineering and physical attacks;
- scanner output without a demonstrated impact.

## Testing rules

- Use your own email address and your own orders or Pro account. Do not access, change or delete
  anyone else's data; if you come across it, stop, do not keep it, and tell us.
- Keep automated requests slow and few, so customers do not notice them.
- Do not make payments you mean to dispute or charge back.

Only the version deployed from `main` is supported.
