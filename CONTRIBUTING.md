# Contributing to DevPulse ⚡

Thanks for being here! This gets you from clone to merged PR. DevPulse is a small, friendly TypeScript codebase — a great spot for a first open-source contribution.

## Getting set up

**Prerequisites:** [Node.js](https://nodejs.org) 20+ (see `.nvmrc`; CI uses 20) and npm. No token or `.env` needed.

```bash
git clone https://github.com/<you>/devpulse.git
cd devpulse
npm install
npm run dev          # → http://localhost:5173
npm test             # run the unit tests
```

## How the code is organized

One **core** (pure TypeScript) and two thin frontends that render what it produces:

```
src/
  core/    ← all fetching + aggregation. Must stay browser AND Node safe.
  web/     ← React UI (the GitHub Pages site)
  cli/     ← Node CLI that writes report.json + report.md
```

**Golden rule:** business logic lives in `src/core`; `web` and `cli` only call it and render. `src/core` must not import React or Node-only modules (`fs`, `path`) — it runs in the browser too. Pass `fetch` in (the core takes a `fetchImpl` param) so it stays testable.

## The data flow

Everything funnels through one function and one type:

```
getReport(username, fetch, token?)        // src/core/index.ts (cached ~30 min)
  ├─ fetchProfile()                       // github.ts
  ├─ fetchCalendar()                      // contributions.ts → heatmap + streaks
  ├─ fetchPublicEvents()                  // github.ts        → ActivityEvent[]
  ├─ fetchTopLanguages()                  // github.ts
  └─ fetchYearRepoContributions()         // graphql.ts (token only)
        ↓ buildReport()  (aggregate.ts)
     Report                               // types.ts ← the single contract
        ↓
   src/web/App.tsx     src/cli/index.ts
```

The **`Report`** interface in [`src/core/types.ts`](src/core/types.ts) is the heart of the app (`profile`, `calendar`, `events`, `byDay`, `byRepo`, `byType`, `languages`, `window`). Read it first — the rest is just producing or consuming it.

## Recipes

**Add a stat tile** — if the number isn't on `Report`, compute it in `aggregate.ts`/`contributions.ts` and add the field to `types.ts`. Then drop a `<StatTile>` into `OverallView` in `App.tsx`.

**Add a chart/card** — build a presentational component in `src/web/components/` that takes aggregated props (no fetching). For charts, register the Chart.js pieces in `Charts.tsx` and export a wrapper (see `DailyChart`, `TypeDoughnut`, `TypeRadar`). Place it in the grid with a `col-*` class.

**Track a contribution type** — map the raw event in `parseEvent()` ([`github.ts`](src/core/github.ts)) to an `ActivityEvent` with a `type` and `weight` (`0` = show in feed, don't count). A new category goes in `ContributionType` + `CONTRIBUTION_TYPES` in `types.ts`; TypeScript will flag every spot to update.

**Retheme** — CSS variables at the top of [`styles.css`](src/web/styles.css) (`--cyan`, `--panel`, light + dark blocks). Chart colors live in `Charts.tsx`.

**Add a CLI flag** — extend `parseArgs()` and `HELP` in [`cli/index.ts`](src/cli/index.ts).

## Conventions

- **Strict TypeScript**, incl. `noUnusedLocals`/`noUnusedParameters` — an unused import fails the build.
- **ESM:** use `.js` extensions in relative imports (`./types.js`) even though files are `.ts`.
- **Keep the core pure** (no React, no `fs`/`path`).
- Match the surrounding style (2-space indent, double quotes, semicolons).

## Before a PR

```bash
npm run build        # type-checks AND builds — must be clean
npm test             # unit tests must pass
```

Tests for new core logic are very welcome — the pure functions in `aggregate.ts`, `contributions.ts` and `persona.ts` are ideal (pass a mock `fetch` to exercise `getReport` without the network). Then smoke-test the UI you touched: a high- and low-activity user, all three modes, and a username that doesn't exist (friendly error, not a crash).

## Commits & PRs

- Branch off `main`; conventional commits (`feat:`, `fix:`, `docs:`, `ref:`, `chore:`).
- Keep PRs focused; say **what** and **why**, add a screenshot/GIF for UI changes, link the issue (`Closes #123`).
- CI must be green (the same `npm run build` runs in `.github/workflows/deploy.yml`).

## Gotchas

- **Rate limits** — ~60 req/hour per IP without a token; the UI surfaces this as a friendly message. A token (the 🔑 in the header) raises it.
- **The ~90-day window is a platform limit**, not a bug — the heatmap spans years, per-project detail covers recent events.
- **Pages base path** — `vite.config.ts` sets `base: "./"`; don't hard-code absolute asset paths.

Questions? Open an [issue](https://github.com/Chemaclass/devpulse/issues) — happy to help you land your first PR. 🎉
