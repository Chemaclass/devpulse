# DevPulse ⚡

[![Deploy to GitHub Pages](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml)

**🔗 Live: https://chemaclass.github.io/devpulse/**

**Type any GitHub username and see how much they worked — day by day, project by project.**
Commits, pull requests, issues, reviews, streaks and a neon contribution heatmap. Public data only, no login, nothing stored.

A fun, deployable web app (Vite + React + TS) with a matching Node CLI for deep JSON/Markdown exports. Built to live on GitHub Pages so anyone can paste their profile and watch their stats light up.

![DevPulse](https://opengraph.githubassets.com/1/Chemaclass/devpulse)

---

## ✨ What it does

- **Overall view** — all-time contributions, current & longest streak, active days, best day, a 12-month heatmap, plus recent activity charts and your most-active projects.
- **Latest day** — jump straight to your most recent active day and see exactly what you shipped.
- **Pick a day** — choose any date (or click a heatmap cell) to drill into that day's commits, PRs, issues, reviews and the projects you touched.

## 🚀 Quick start

> **Prerequisites:** [Node.js](https://nodejs.org) **18+** and npm. That's it — no GitHub token, no API keys, no `.env`.

```bash
git clone https://github.com/Chemaclass/devpulse.git
cd devpulse
npm install
npm run dev          # → open the printed http://localhost:5173
```

Type a username (try `torvalds`) and you're running. New here? Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full developer guide.

## 📜 npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) **and** build the production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only, no emit |
| `npm run report -- <user>` | Run the CLI: write `report.json` + `report.md` |

## 🖥️ CLI (deep export for your own profile)

Generates `report.json` + `report.md` (day-by-day tables, top projects, streaks):

```bash
npm run report -- <username|profile-url> [--out ./out] [--json-only|--md-only]

# examples
npm run report -- chemaclass
npm run report -- https://github.com/torvalds -o ./reports
```

## 🧱 Architecture at a glance

DevPulse is split into a framework-agnostic **core** consumed by two frontends — the **web** app and the **CLI**. The core does all fetching and aggregation; the frontends only render.

```
                 ┌─────────────────────────── src/core ───────────────────────────┐
  username ─────▶│ github.ts        contributions.ts                               │
                 │  profile +        calendar (heatmap)                            │
                 │  public events    + streaks                                     │
                 │        └────────────┬────────────┘                              │
                 │                 aggregate.ts  → buildReport()                   │
                 │                     │                                           │
                 │              getReport(username) ──▶  Report (typed object)     │
                 └─────────────────────┬───────────────────────┬─────────────────-┘
                                       │                        │
                              src/web (React)            src/cli (Node)
                          heatmap · charts · feed      report.json + report.md
```

A single `Report` type (see `src/core/types.ts`) is the contract between core and UI. If you can produce a `Report`, both frontends render it.

### Where the data comes from (and the honest limits)

DevPulse uses **only public, unauthenticated data**, so it works for any username straight from the browser — with real constraints:

| Source | Gives us | Limits |
| --- | --- | --- |
| [Contribution calendar proxy](https://github.com/grubersjoe/github-contributions-api) | Daily contribution totals across the user's whole history (heatmap + streaks) | Daily **totals only** — no per-project / per-type split |
| [GitHub public events API](https://docs.github.com/en/rest/activity/events) | Per-project, per-type detail (commits, PRs, issues, reviews) | Only the **~300 most recent events (≈ last 90 days)**, public repos only; **60 requests/hour per IP** without a token |

So the **heatmap and streaks** go back years, but the **detailed project/type breakdown** covers roughly the last 90 days. Older or private contributions show on the calendar without per-project detail — a GitHub limitation for token-free access, not a bug.

### Project structure

```
src/
  core/              # shared, browser + Node safe — no React, no Node-only APIs
    types.ts           # domain models + the central `Report` type
    contributions.ts   # calendar (heatmap) fetch + streak math
    github.ts          # profile + public events fetch & normalize
    aggregate.ts       # buildReport(): byDay / byRepo / byType
    index.ts           # getReport() one-shot + helpers (parseUsername)
  web/               # Vite + React app (the GitHub Pages site)
    App.tsx            # state, modes (overall / latest / day), layout
    components/        # Heatmap, Charts, Bars, Feed
    styles.css         # the futuristic neon theme (CSS variables up top)
  cli/               # Node CLI -> report.json + report.md
    index.ts           # arg parsing + orchestration
    markdown.ts        # Report -> Markdown
.github/workflows/deploy.yml   # CI build + GitHub Pages deploy
```

## 🤝 Contributing

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, the data-flow walkthrough, copy-paste recipes (add a stat, a card, a contribution type, retheme), coding conventions, and the PR checklist. Good first issues are tagged [`good first issue`](https://github.com/Chemaclass/devpulse/labels/good%20first%20issue).

## 🛠️ Roadmap

- [ ] Optional "paste your own token" toggle to unlock multi-year, per-project history via the GraphQL API.
- [ ] Shareable result URLs (`?u=username&mode=date&d=2026-05-30`).
- [ ] Compare two users side by side.
- [ ] Language / repo-topic breakdowns.

## 🌐 Deploy your own

1. Fork or push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main`. The workflow (`.github/workflows/deploy.yml`) builds and publishes automatically; the live URL appears on the Pages settings screen.

The Vite `base` is `"./"` (relative paths), so it works on a project page, a user/org page, or a custom domain with no extra config.

## License

[MIT](LICENSE) © Chemaclass
