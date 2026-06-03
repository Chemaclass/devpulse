# DevPulse ⚡

[![Deploy to GitHub Pages](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml)

**🔗 Live: https://chemaclass.github.io/devpulse/**

**Type any GitHub username and see how much they worked, day by day and project by project.**
Commits, pull requests, issues, reviews, streaks, a rotatable 3D contribution forest, a playful developer archetype, top languages, and light/dark themes. Public data only, no login, nothing stored.

A fun, deployable web app (Vite + React + TS) with a matching Node CLI for deep JSON/Markdown exports. Built to live on GitHub Pages so anyone can paste their profile and watch their stats light up.

![DevPulse](https://opengraph.githubassets.com/1/Chemaclass/devpulse)

---

## ✨ What it does

- **Overall view**: all-time contributions, current and longest streak, active days, best day, recent activity charts, and your most-active projects.
- **Developer archetype**: a fun persona (Shipper, Guardian, Machine, and more) derived from the activity mix, with chronotype, favorite day, weekend share, and peak month.
- **3D contribution forest**: the calendar rendered as a rotatable, zoomable forest of trees (taller/fuller = more contributions), with a 2D grid toggle.
- **Latest day / Pick a day**: jump to the most recent active day, or click any cell/building to drill into that day's commits, PRs, issues, reviews, and projects.
- **Top languages**: primary-language breakdown across public repos.
- **Compare two users**: head-to-head metrics and two forests on a shared height scale.
- **Light and dark themes**, and **shareable URLs** (`?u=`, `?d=`, `?mode=`, `?vs=`).
- **Optional token**: paste a GitHub PAT (kept in your browser session) for higher rate limits and real per-repo commit history from the last year.

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
  username ─────▶│ github.ts   contributions.ts   graphql.ts (token, optional)    │
                 │  profile +   calendar (heatmap)  per-repo year history          │
                 │  events +    + streaks                                          │
                 │  languages        └──────┬──────┘                              │
                 │                    aggregate.ts → buildReport()                 │
                 │                    persona.ts   → derivePersona()               │
                 │                          │                                      │
                 │             getReport(username, fetch, token?) ──▶ Report       │
                 └─────────────────────┬───────────────────────┬─────────────────-┘
                                       │                        │
                              src/web (React)            src/cli (Node)
                       skyline · charts · persona      report.json + report.md
                       compare · themes · feed
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
  core/              # shared, browser + Node safe (no React, no Node-only APIs)
    types.ts           # domain models + the central `Report` type
    contributions.ts   # calendar (heatmap) fetch + streak math
    github.ts          # profile, public events, languages fetch & normalize
    graphql.ts         # token-only: per-repo commit history (last year)
    persona.ts         # derivePersona(): the developer archetype
    aggregate.ts       # buildReport(): byDay / byRepo / byType
    index.ts           # getReport() one-shot + helpers (parseUsername)
  web/               # Vite + React app (the GitHub Pages site)
    App.tsx            # state, modes, deep-linking, layout
    theme.tsx          # light/dark context   token.tsx # session token context
    components/        # Skyline3D, Heatmap, Charts, Bars, Feed, Persona, Compare
    styles.css         # forest + city theme (CSS variables up top, light & dark)
  cli/               # Node CLI -> report.json + report.md
    index.ts           # arg parsing + orchestration
    markdown.ts        # Report -> Markdown
.github/workflows/deploy.yml   # CI build + GitHub Pages deploy
```

## 🤝 Contributing

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, the data-flow walkthrough, copy-paste recipes (add a stat, a card, a contribution type, retheme), coding conventions, and the PR checklist. Good first issues are tagged [`good first issue`](https://github.com/Chemaclass/devpulse/labels/good%20first%20issue).

## 🛠️ Roadmap

- [x] Optional "paste your own token" toggle to unlock per-repo history (last year) via the GraphQL API, plus higher rate limits. The token stays in your browser session and is sent only to api.github.com.
- [x] Shareable result URLs (`?u=username&mode=latest` or `?u=username&d=2026-05-30`).
- [x] Compare two users side by side.
- [x] Language / repo-topic breakdowns.

## 🌐 Deploy your own

1. Fork or push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main`. The workflow (`.github/workflows/deploy.yml`) builds and publishes automatically; the live URL appears on the Pages settings screen.

The Vite `base` is `"./"` (relative paths), so it works on a project page, a user/org page, or a custom domain with no extra config.

## License

[MIT](LICENSE) © Chemaclass
