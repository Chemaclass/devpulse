# DevPulse OG worker

A Cloudflare Worker that gives DevPulse **dynamic Open Graph previews**, so a
shared link like `?u=torvalds` unfurls into a per-user stat card on X,
LinkedIn, Slack, etc.

GitHub Pages serves one static `index.html` with fixed `og:` tags, so it can't
do per-URL previews on its own. This worker sits in front of the site:

- **`/og?u=<login>`** renders a 1200×630 PNG (persona + key stats) using
  [`workers-og`](https://github.com/kvnang/workers-og).
- **everything else** proxies the static Pages site and, when `?u=` is present,
  injects `og:image` / `twitter:image` and a per-user `og:title` via
  `HTMLRewriter`.

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Then make the worker the site's public URL:

1. Add a **custom domain** (or Workers route) to the worker in the Cloudflare
   dashboard, e.g. `devpulse.example.com/*`.
2. Use that domain as the link you share. `SITE` in `wrangler.toml` stays the
   GitHub Pages origin the worker proxies and screenshots.

Local preview: `npm run dev`, then open `http://localhost:8787/og?u=torvalds`.

## Notes

- Data comes from the same public sources as the app (no token). The 60 req/hour
  GitHub limit applies per worker IP; responses are cached an hour.
- This is optional. The site works fully on Pages without it; the worker only
  upgrades link previews.
