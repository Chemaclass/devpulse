# DevPulse ⚡

[![Deploy to GitHub Pages](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/Chemaclass/devpulse/actions/workflows/deploy.yml)

**🔗 Live: https://chemaclass.github.io/devpulse/**

**Type any GitHub username and see how much they worked — day by day, project by project.**
Commits, pull requests, issues, reviews, streaks and a neon contribution heatmap. Public data only, no login, nothing stored.

A fun, deployable web app (Vite + React + TS) with a matching Node CLI for deep JSON/Markdown exports. Built to live on GitHub Pages so anyone can paste their profile and watch their stats light up.

---

## ✨ What it does

- **Overall view** — all-time contributions, current & longest streak, active days, best day, a 12-month heatmap, plus recent activity charts and your most-active projects.
- **Latest day** — jump straight to your most recent active day and see exactly what you shipped.
- **Pick a day** — choose any date (or click a heatmap cell) to drill into that day's commits, PRs, issues, reviews and the projects you touched.

## 🔌 Where the data comes from (and the honest limits)

DevPulse uses **only public, unauthenticated data** — so it works for any username straight from the browser, but that comes with real constraints:

| Source | Gives us | Limits |
| --- | --- | --- |
| [Contribution calendar proxy](https://github.com/grubersjoe/github-contributions-api) | Daily contribution totals across the user's whole history (the heatmap + streaks) | Daily **totals only** — no per-project / per-type split |
| [GitHub public events API](https://docs.github.com/en/rest/activity/events) | Per-project, per-type detail (commits, PRs, issues, reviews) | Only the **~300 most recent events (≈ last 90 days)**, public repos only; rate-limited to **60 requests/hour per IP** without a token |

So: the **heatmap and streaks** go back years, but the **detailed project/type breakdown** covers roughly the last 90 days. Days older than that (or private contributions) show on the calendar but without per-project detail. That's a GitHub limitation for token-free access, not a bug.

## 🚀 Run locally

```bash
npm install
npm run dev          # open the printed localhost URL
```

Build a production bundle:

```bash
npm run build
npm run preview
```

## 🖥️ CLI (deep export for your own profile)

Generates `report.json` + `report.md` (day-by-day tables, top projects, streaks):

```bash
npm run report -- <username|profile-url> [--out ./out] [--json-only|--md-only]

# examples
npm run report -- chemaclass
npm run report -- https://github.com/torvalds -o ./reports
```

## 🌐 Deploy to GitHub Pages

1. Push this repo to GitHub (e.g. `Chemaclass/devpulse`).
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and publishes automatically.
4. Your app goes live at `https://<you>.github.io/<repo>/`.

The Vite `base` is set to `"./"` (relative paths), so it works on a project page, a user/org page, or a custom domain with no extra config.

## 🧱 Project structure

```
src/
  core/            # shared, browser + Node safe
    types.ts         # domain models
    contributions.ts # calendar (heatmap) fetch + streaks
    github.ts        # profile + public events fetch & normalize
    aggregate.ts     # build the Report (byDay / byRepo / byType)
    index.ts         # getReport() one-shot + helpers
  web/             # Vite + React app (the GitHub Pages site)
    App.tsx
    components/      # Heatmap, Charts, Bars, Feed
    styles.css       # the futuristic neon theme
  cli/             # Node CLI -> report.json + report.md
.github/workflows/deploy.yml
```

## 🛠️ Ideas / roadmap

- Optional "paste your own token" toggle to unlock multi-year, per-project history via the GraphQL API.
- Shareable result URLs (`?u=username&mode=date&d=2026-05-30`).
- Compare two users side by side.
- Language / repo-topic breakdowns.

## License

MIT
