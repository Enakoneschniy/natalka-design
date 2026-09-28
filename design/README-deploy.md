# Staging deploy

The mockups are served by a Cloudflare Worker with static assets:

```bash
wrangler deploy --config design/wrangler.jsonc
```

→ https://natalka-design.ceo-63e.workers.dev (account `f63eebad9e3bd39565a3129188e84a47`).

`_redirects` maps `/` to `index.html`; `.assetsignore` keeps tooling out of the bundle.
The same mockups are also published by GitHub Pages from `main`.
