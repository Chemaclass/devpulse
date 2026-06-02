# Contributing to DevPulse ⚡

Thanks for being here! This guide gets you from clone to merged PR. DevPulse is a small, friendly TypeScript codebase — a great place to make your first open-source contribution.

- [Getting set up](#getting-set-up)
- [How the code is organized](#how-the-code-is-organized)
- [The data flow](#the-data-flow)
- [Recipes (copy-paste starting points)](#recipes)
- [Coding conventions](#coding-conventions)
- [Before you open a PR](#before-you-open-a-pr)
- [Commit & PR guidelines](#commit--pr-guidelines)
- [Good to know (gotchas)](#good-to-know-gotchas)

---

## Getting set up

**Prerequisites:** [Node.js](https://nodejs.org) 18 or newer (the CI uses 20) and npm. No GitHub token, API key, or `.env` file is needed — DevPulse only uses public data.

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<you>/devpulse.git
cd devpulse

# 2. Install
npm install

# 3. Run the app with hot reload
npm run dev          # → http://localhost:5173

# 4. (optional) Try the CLI against the same core
npm run report -- torvalds
```

If `npm run dev` opens and a username search renders charts, you're ready.

## How the code is organized

DevPulse has one **core** (pure TypeScript, no framework) and two thin frontends that render what the core produces.

```
src/
  core/    ← all fetching + number-crunching. Must stay browser AND Node safe.
  web/     ← React UI (the GitHub Pages site)
  cli/     ← Node CLI that writes report.json + report.md
```

**The golden rule:** business logic lives in `src/core`. The web and CLI layers should only *call* the core and *render* its output. If you find yourself parsing a GitHub response inside a React component, move it to the core.

`src/core` must not import React or Node-only modules (`fs`, `path`, …) — it runs in the browser too. Node-only code belongs in `src/cli`.

## The data flow

Everything funnels through one function and one type.

```
getReport(username)            // src/core/index.ts
  ├─ fetchProfile()            // src/core/github.ts        → Profile
  ├─ fetchCalendar()           // src/core/contributions.ts → CalendarSummary (heatmap + streaks)
  └─ fetchPublicEvents()       // src/core/github.ts        → ActivityEvent[]
        ↓
  buildReport()                // src/core/aggregate.ts
        ↓
  Report                       // src/core/types.ts  ← the single contract
        ↓
  ┌──────────────┬──────────────┐
  src/web/App.tsx        src/cli/index.ts
```

The **`Report`** interface in [`src/core/types.ts`](src/core/types.ts) is the heart of the app. It carries `profile`, `calendar`, `events`, `byDay`, `byRepo`, `byType`, and a `window`. Read it first — once you understand `Report`, the rest of the code is just producing or consuming it.

## Recipes

Concrete, common changes and exactly where to make them.

### Add a new stat tile to the Overall view

1. The number probably already exists on `Report` (e.g. `calendar.longestStreak`). If not, compute it in `src/core/aggregate.ts` or `contributions.ts` and add the field to `types.ts`.
2. In `src/web/App.tsx`, find the `OverallView` component's `<div className="stats">` and add a `<StatTile>`:

   ```tsx
   <StatTile className="glow-green" icon="🌱" value={String(report.calendar.activeDays)} label="Active days" />
   ```

### Add a new dashboard card / chart

1. Build a presentational component in `src/web/components/` that takes already-aggregated props (no fetching inside).
2. For charts, register the Chart.js pieces you need in `src/web/components/Charts.tsx` and export a small wrapper (see `DailyStackedChart` / `TypeDoughnut`).
3. Drop it into the grid in `App.tsx` with a `col-*` class (`col-4`, `col-6`, `col-8`, `col-12`).

### Track a new contribution type (e.g. count stars or releases differently)

1. Event parsing lives in `parseEvent()` in [`src/core/github.ts`](src/core/github.ts) — map the raw GitHub event `type` to an `ActivityEvent` with the right `type` and `weight` (weight = how much it counts toward totals; `0` means "show in the feed but don't count").
2. If you need a brand-new category, add it to `ContributionType` and `CONTRIBUTION_TYPES` in `types.ts`; the aggregation, doughnut, and color maps key off that union, so TypeScript will point you to every spot that needs updating.

### Retheme / restyle

All colors and look-and-feel live as CSS variables at the top of [`src/web/styles.css`](src/web/styles.css) (`--cyan`, `--magenta`, `--panel`, …). Change them there; chart colors are in `Charts.tsx`.

### Add a CLI flag

Extend `parseArgs()` and the `HELP` text in [`src/cli/index.ts`](src/cli/index.ts).

## Coding conventions

- **TypeScript strict mode is on** (including `noUnusedLocals` / `noUnusedParameters`). An unused import will fail the build — keep imports clean.
- **ESM everywhere.** Use `.js` extensions in relative imports (e.g. `import { x } from "./types.js"`) even though the files are `.ts` — that's required by the bundler/Node ESM resolution used here.
- **Keep the core pure.** No React, no `fs`/`path` in `src/core`. Pass `fetch` in where needed (the core accepts a `fetchImpl` param) so it stays testable and runtime-agnostic.
- **Prefer narrow, presentational components.** Fetch and aggregate in the core; components receive plain data via props.
- **Names:** `camelCase` for values/functions, `PascalCase` for types and React components.
- No linter/formatter is enforced yet; match the surrounding style (2-space indent, double quotes, semicolons).

## Before you open a PR

There's no test suite yet, so the build is your gate. Run:

```bash
npm run build        # type-checks AND builds — must pass with zero errors
```

Then manually smoke-test what you touched:

- Search a high-activity user (`torvalds`, `sindresorhus`) and a low-activity one.
- Try all three modes: **Overall**, **Latest day**, **Pick a day** (and click a heatmap cell).
- Try a username that doesn't exist — you should get a friendly error, not a crash.

Adding a unit test for new core logic (pure functions in `aggregate.ts` / `contributions.ts` are ideal) is very welcome — pass a mock `fetch` to exercise `getReport` without the network.

## Commit & PR guidelines

- Branch off `main`: `git checkout -b feat/short-description`.
- Conventional-commit style is appreciated: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- Keep PRs focused and small; describe **what** and **why**, and include a screenshot/GIF for any UI change.
- Link the issue you're closing (`Closes #123`).
- CI must be green (the same `npm run build` runs in `.github/workflows/deploy.yml`).

## Good to know (gotchas)

- **Rate limits.** The public GitHub events API allows ~60 requests/hour per IP without a token. If you're testing a lot and start seeing rate-limit errors, that's expected — wait a bit. The UI surfaces this as a friendly message (see the `rate_limited` branch in `App.tsx`).
- **The ~90-day window is a platform limit,** not a bug. The heatmap spans years (calendar proxy); the per-project/per-type detail only covers recent public events. When a day has calendar contributions but no event detail, the UI shows an explanatory note.
- **Pages base path.** `vite.config.ts` sets `base: "./"` so the build works under `/devpulse/` on Pages. Don't hard-code absolute asset paths.
- **First Pages deploy** needs **Settings → Pages → Source = GitHub Actions** set once; after that every push to `main` redeploys.

Questions? Open a [discussion or issue](https://github.com/Chemaclass/devpulse/issues) — happy to help you land your first PR. 🎉
