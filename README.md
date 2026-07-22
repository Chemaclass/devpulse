# DevPulse ⚡

[![Deploy to GitHub Pages](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml)

**🔗 Live: https://chemaclass.github.io/devpulse/**

**Type any GitHub username and see how much they worked.** Commits, PRs, issues, reviews, streaks, a rotatable 3D contribution forest, a playful developer archetype, and head-to-head battles. Public data only, no login, nothing stored.

A small Vite + React + TypeScript app (plus a matching Node CLI) that runs entirely in the browser on GitHub Pages.

## ✨ Features

- **Overall dashboard**: all-time totals, streaks, active days, best day, and recent-activity charts.
- **Developer archetype**: a fun persona (Shipper, Guardian, Machine…) from the activity mix, plus chronotype, favorite day and peak month.
- **3D forest**: the calendar as a rotatable forest of trees (taller = more), with a 2D grid toggle.
- **Compare two users**: a head-to-head with a scoreboard, fun facts, overlaid charts and side-by-side forests.
- **Gamification**: an activity level and unlockable achievement badges.
- **Top languages**, **light/dark themes**, and **shareable URLs** (`?u=`, `?d=`, `?mode=`, `?vs=`).
- **Optional token**: paste a GitHub PAT (kept in your browser session) for higher rate limits and accurate last-year stats (contribution mix and top projects) via GraphQL.

## 🚀 Quick start

> **Prerequisites:** [Node.js](https://nodejs.org) 18+ and npm. No token or `.env` needed.

```bash
git clone https://github.com/Chemaclass/devpulse.git
cd devpulse
npm install
npm run dev          # → http://localhost:5173
```

Type a username (try `torvalds`) and you're running.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check + production build to `dist/` |
| `npm test` | Run the unit tests (Vitest) |
| `npm run report -- <user>` | CLI: write `report.json` + `report.md` |

## 🖥️ CLI

```bash
npm run report -- <username|profile-url> [--out ./out] [--json-only|--md-only]
# GITHUB_TOKEN is read from the env if set (higher limits + per-repo year history)
```

## 🧱 How it works

Three layers, one contract. A framework-agnostic **core** (`src/core`) is the only layer that talks to GitHub; it fetches and aggregates everything into a single `Report`, which the **web** and **CLI** frontends just render.

```mermaid
flowchart LR
  GH["GitHub public APIs"] --> core
  subgraph core["src/core — data + logic (no React, no Node-only APIs)"]
    direction LR
    F["fetch/adapters<br/>github · contributions · graphql"] --> A["aggregate"] --> R[["Report<br/>(types.ts)"]]
  end
  R --> WEB["src/web<br/>React UI"]
  R --> CLI["src/cli<br/>report.json / .md"]
```

**Golden rule:** business logic lives in `core`; `web` and `cli` only call it and render. `core` never imports React or Node-only modules, so it runs in the browser and the CLI alike (`fetch` is injected for testability). Data is public and unauthenticated:

| Source | Gives us | Limit |
| --- | --- | --- |
| [Contribution calendar proxy](https://github.com/grubersjoe/github-contributions-api) | Daily totals across full history (heatmap, streaks) | Totals only, no per-type split |
| [GitHub events API](https://docs.github.com/en/rest/activity/events) | Per-type/per-project detail | ~300 recent events (~90 days), 60 req/hour without a token |

So the heatmap and streaks span years, while the per-project breakdown covers roughly the last 90 days. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the architecture, data flow and contribution recipes.

## 🤝 Contributing

Contributions welcome. See **[CONTRIBUTING.md](CONTRIBUTING.md)**. Good first issues are tagged [`good first issue`](https://github.com/Chemaclass/devpulse/labels/good%20first%20issue).

## License

[MIT](LICENSE) © Chemaclass
