import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ContributionType,
  derivePersona,
  getReport,
  GitHubError,
  parseUsername,
  Persona as TPersona,
  Report,
} from "../core/index.js";
import { Landing, Skeleton } from "./components/AppStates.js";
import { Bars, BarDatum } from "./components/Bars.js";
import {
  DailyChart,
  TypeDoughnut,
  TypeRadar,
  WeekdayBars,
  YearBars,
} from "./components/Charts.js";
import { Feed } from "./components/Feed.js";
import { GameCard } from "./components/GameCard.js";
import {
  ThemeToggle,
  TokenControl,
} from "./components/HeaderControls.js";
import { Heatmap } from "./components/Heatmap.js";
import { Persona } from "./components/Persona.js";
import { StatTile } from "./components/StatTile.js";
import { setQueryParam, syncUrl } from "./lib/url.js";
import { useToken } from "./token.js";

// three.js is heavy; only load it when the 3D view is shown.
const Skyline3D = lazy(() =>
  import("./components/Skyline3D.js").then((m) => ({ default: m.Skyline3D })),
);
const Compare = lazy(() =>
  import("./components/Compare.js").then((m) => ({ default: m.Compare })),
);

type Mode = "overall" | "latest" | "date";
const EXAMPLES = ["torvalds", "gaearon", "chemaclass"];

const SITE = "https://chemaclass.github.io/devpulse/";

// One Share button that opens a small menu: copy link, challenge invite,
// or a README badge snippet.
function ShareTools({ login, persona }: { login: string; persona: TPersona }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reportUrl = `${window.location.origin}${window.location.pathname}?u=${login}`;

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const badge = `[![DevPulse](https://img.shields.io/badge/DevPulse-${encodeURIComponent(
    persona.title,
  )}-2f7d44?logo=github)](${SITE}?u=${login})`;

  function copy(kind: string, text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(kind);
    setTimeout(() => {
      setCopied(null);
      setOpen(false);
    }, 1100);
  }

  return (
    <div className="share-menu-wrap" ref={wrapRef}>
      <button className="share-btn" onClick={() => setOpen((o) => !o)}>
        🔗 Share ▾
      </button>
      {open && (
        <div className="share-menu">
          <button onClick={() => copy("link", reportUrl)}>
            {copied === "link" ? "✓ Copied" : "🔗 Copy link"}
          </button>
          <button
            onClick={() =>
              copy(
                "challenge",
                `⚔️ Can you out-code @${login} on DevPulse? ${reportUrl}`,
              )
            }
          >
            {copied === "challenge" ? "✓ Copied" : "⚔️ Copy challenge invite"}
          </button>
          <button onClick={() => copy("readme", badge)}>
            {copied === "readme" ? "✓ Copied" : "📋 Copy README badge"}
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("overall");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // A view (mode + day) read from the URL, applied once the report loads.
  const [pendingView, setPendingView] = useState<{
    mode: Mode;
    date: string | null;
  } | null>(null);
  // Second user for side-by-side comparison.
  const [vsReport, setVsReport] = useState<Report | null>(null);
  const [vsLoading, setVsLoading] = useState(false);
  const [vsError, setVsError] = useState<string | null>(null);
  const [pendingVs, setPendingVs] = useState<string | null>(null);
  const { token } = useToken();

  async function run(raw: string) {
    const username = parseUsername(raw);
    if (!username) return;
    syncUrl(username);
    setLoading(true);
    setError(null);
    setReport(null);
    setMode("overall");
    setSelectedDate(null);
    setVsReport(null);
    setVsError(null);
    setQueryParam("vs", null);
    try {
      const r = await getReport(username, fetch, token);
      setReport(r);
    } catch (err) {
      if (err instanceof GitHubError && err.kind === "rate_limited") {
        setError(
          "GitHub's public API rate limit was hit (60 req/hour per IP). Please try again in a little while.",
        );
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function runVs(raw: string) {
    const username = parseUsername(raw);
    if (!username) return;
    setVsLoading(true);
    setVsError(null);
    try {
      const r = await getReport(username, fetch, token);
      setVsReport(r);
      setQueryParam("vs", r.profile.login);
    } catch (err) {
      setVsError(
        err instanceof GitHubError && err.kind === "rate_limited"
          ? "GitHub rate limit hit. Try again in a little while."
          : (err as Error).message,
      );
    } finally {
      setVsLoading(false);
    }
  }

  function exitCompare() {
    setVsReport(null);
    setVsError(null);
    setQueryParam("vs", null);
  }

  // Reset to the empty home state and clear the URL query.
  function goHome() {
    setQuery("");
    setReport(null);
    setError(null);
    setLoading(false);
    setMode("overall");
    setSelectedDate(null);
    setVsReport(null);
    setVsError(null);
    window.history.pushState({}, "", window.location.pathname);
    document.title = "DevPulse ⚡ GitHub work, visualized";
  }

  // Deep-link support: load ?u=<name> with an optional view (?mode=latest or
  // ?d=<date>) and optional ?vs=<name> on first paint and on back/forward.
  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams(window.location.search);
      const u = params.get("u");
      if (!u) return;
      const d = params.get("d");
      const m: Mode = d ? "date" : params.get("mode") === "latest" ? "latest" : "overall";
      setQuery(u);
      setPendingView({ mode: m, date: d });
      setPendingVs(params.get("vs"));
      run(u);
    };
    load();
    window.addEventListener("popstate", load);
    return () => window.removeEventListener("popstate", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the report is in, honour the deep-linked view.
  useEffect(() => {
    if (report && pendingView) {
      setMode(pendingView.mode);
      setSelectedDate(pendingView.date);
      setPendingView(null);
    }
  }, [report, pendingView]);

  // Honour a deep-linked ?vs=<name> once the main report has loaded.
  useEffect(() => {
    if (report && pendingVs) {
      runVs(pendingVs);
      setPendingVs(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, pendingVs]);

  // Keep the URL in sync with the current view (mode + selected day).
  useEffect(() => {
    setQueryParam("d", mode === "date" ? selectedDate : null);
    setQueryParam("mode", mode === "latest" ? "latest" : null);
  }, [mode, selectedDate]);

  return (
    <div className="shell">
      <div className="top-controls">
        <TokenControl />
        <ThemeToggle />
      </div>
      <header className="hero">
        <h1
          className="logo"
          onClick={goHome}
          role="button"
          tabIndex={0}
          title="Back to home"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") goHome();
          }}
        >
          Dev<span className="spark">⚡</span>Pulse
        </h1>
        <p className="tagline">
          Type any GitHub username and see how much they worked. Commits, PRs,
          issues, reviews and streaks, day by day. Public data.
        </p>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="github username or profile URL…"
            autoFocus
            spellCheck={false}
            autoCapitalize="none"
            type="search"
            name="devpulse-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
          />
          <button type="submit" disabled={loading}>
            {loading ? "Scanning…" : "Pulse it"}
          </button>
        </form>
        <p className="examples">
          Try{" "}
          {EXAMPLES.map((u, i) => (
            <span key={u}>
              <button
                onClick={() => {
                  setQuery(u);
                  run(u);
                }}
              >
                {u}
              </button>
              {i < EXAMPLES.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </header>

      {loading && <Skeleton />}

      {error && !loading && (
        <div className="card error">
          <h3>Couldn't load that profile</h3>
          <p className="muted">{error}</p>
        </div>
      )}

      {!report && !loading && !error && <Landing />}

      {report && !loading && vsReport && (
        <Suspense fallback={<Skeleton />}>
          <Compare
            a={report}
            b={vsReport}
            onExit={exitCompare}
            onView={(login) => {
              setQuery(login);
              run(login);
            }}
          />
        </Suspense>
      )}

      {report && !loading && !vsReport && (
        <Dashboard
          report={report}
          mode={mode}
          setMode={setMode}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onCompare={runVs}
          vsLoading={vsLoading}
          vsError={vsError}
        />
      )}

      <footer>
        <p>
          DevPulse uses only public GitHub data · contribution calendar via{" "}
          <a href="https://github.com/grubersjoe/github-contributions-api">
            jogruber/contributions-api
          </a>{" "}
          + the public{" "}
          <a href="https://docs.github.com/en/rest/activity/events">
            events API
          </a>
          . No tokens, nothing stored.
        </p>
        <p>
          Built by{" "}
          <a href="https://chemaclass.com" target="_blank" rel="noreferrer">
            Chemaclass
          </a>{" "}
          ·{" "}
          <a
            href="https://chemaclass.com/sponsor/"
            target="_blank"
            rel="noreferrer"
          >
            ♥ Sponsor
          </a>
        </p>
      </footer>
    </div>
  );
}

function CompareBar({
  onCompare,
  loading,
  error,
}: {
  onCompare: (name: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="compare-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onCompare(value.trim());
      }}
    >
      <span className="cb-label">⚔️ Compare with</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="another username"
        spellCheck={false}
        autoCapitalize="none"
        type="search"
        name="devpulse-compare"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? "Loading…" : "Compare"}
      </button>
      {error && <span className="cb-error">{error}</span>}
    </form>
  );
}

function Dashboard({
  report,
  mode,
  setMode,
  selectedDate,
  setSelectedDate,
  onCompare,
  vsLoading,
  vsError,
}: {
  report: Report;
  mode: Mode;
  setMode: (m: Mode) => void;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  onCompare: (name: string) => void;
  vsLoading: boolean;
  vsError: string | null;
}) {
  const { profile, calendar } = report;
  const persona = useMemo(() => derivePersona(report), [report]);

  // Reflect the viewed profile in the tab title so shared links read well.
  useEffect(() => {
    const prev = document.title;
    document.title = `${profile.name ?? profile.login} · DevPulse`;
    return () => {
      document.title = prev;
    };
  }, [profile]);

  // Resolve the active day for "latest" / "date" modes.
  const latestActive = useMemo(() => {
    if (report.byDay.length) return report.byDay[0].date;
    const active = [...calendar.days].reverse().find((d) => d.count > 0);
    return active?.date ?? null;
  }, [report, calendar]);

  const activeDate =
    mode === "latest" ? latestActive : mode === "date" ? selectedDate : null;

  return (
    <>
      <div className="profile">
        <img src={profile.avatarUrl} alt={profile.login} />
        <div>
          <h2>{profile.name ?? profile.login}</h2>
          <div className="handle">
            <a href={profile.htmlUrl} target="_blank" rel="noreferrer">
              @{profile.login}
            </a>{" "}
            · {profile.followers.toLocaleString()} followers ·{" "}
            {profile.publicRepos} repos
          </div>
          {profile.bio && <div className="bio">{profile.bio}</div>}
          <div className="profile-chips">
            {profile.company && (
              <span className="chip">🏢 {profile.company}</span>
            )}
            {profile.location && (
              <span className="chip">📍 {profile.location}</span>
            )}
            {profile.createdAt && (
              <span className="chip">
                🌱 Since {profile.createdAt.slice(0, 4)}
              </span>
            )}
            <a
              className="chip chip-link"
              href={`${profile.htmlUrl}?tab=achievements`}
              target="_blank"
              rel="noreferrer"
            >
              🏅 Achievements →
            </a>
          </div>
        </div>
      </div>

      <div className="dash-toolbar">
        <div className="dash-toolbar-row">
          <div className="modes">
            <button
              className={mode === "overall" ? "active" : ""}
              onClick={() => setMode("overall")}
            >
              Overall
            </button>
            <button
              className={mode === "latest" ? "active" : ""}
              onClick={() => setMode("latest")}
            >
              Latest day
            </button>
            <button
              className={mode === "date" ? "active" : ""}
              onClick={() => setMode("date")}
            >
              Pick a day
            </button>
            {mode === "date" && (
              <input
                type="date"
                value={selectedDate ?? ""}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setSelectedDate(e.target.value || null)}
              />
            )}
          </div>
          <ShareTools login={profile.login} persona={persona} />
        </div>
        <CompareBar onCompare={onCompare} loading={vsLoading} error={vsError} />
      </div>

      {mode === "overall" ? (
        <OverallView report={report} onPickDay={(d) => {
          setMode("date");
          setSelectedDate(d);
        }} />
      ) : (
        <DayView report={report} date={activeDate} />
      )}

      {report.notes.map((n, i) => (
        <p className="note" key={i}>
          ℹ️ {n}
        </p>
      ))}
    </>
  );
}

function OverallView({
  report,
  onPickDay,
}: {
  report: Report;
  onPickDay: (date: string) => void;
}) {
  const { calendar, byType, byRepo, byDay, window } = report;

  const repoBars: BarDatum[] = byRepo
    .slice(0, 10)
    .map((r) => ({ name: r.repo, value: r.total, href: r.repoUrl }));

  const langBars: BarDatum[] = report.languages
    .slice(0, 8)
    .map((l) => ({ name: l.language, value: l.repos }));

  const persona = useMemo(() => derivePersona(report), [report]);
  const [view, setView] = useState<"3d" | "grid">("3d");

  return (
    <>
      <Persona persona={persona} login={report.profile.login} />

      <div className="stats">
        <StatTile
          className="glow-cyan"
          icon="🔥"
          value={calendar.total.toLocaleString()}
          label="All-time contributions"
        />
        <StatTile
          className="glow-amber"
          icon="⚡"
          value={`${calendar.currentStreak}d`}
          label="Current streak"
          sub={`Longest ${calendar.longestStreak}d`}
        />
        <StatTile
          className="glow-violet"
          icon="📅"
          value={calendar.activeDays.toLocaleString()}
          label="Active days"
          sub={`~${calendar.averagePerActiveDay.toFixed(1)}/day`}
        />
        <StatTile
          className="glow-magenta"
          icon="🏆"
          value={calendar.bestDay ? String(calendar.bestDay.count) : "0"}
          label="Best day"
          sub={calendar.bestDay?.date}
        />
      </div>

      <div className="card col-12" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Contributions · last 12 months</h3>
          <div className="view-toggle">
            <button
              className={view === "3d" ? "active" : ""}
              onClick={() => setView("3d")}
            >
              3D
            </button>
            <button
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
          </div>
        </div>
        {view === "3d" ? (
          <Suspense
            fallback={<div className="skyline-loading muted">Rendering 3D…</div>}
          >
            <Skyline3D days={calendar.days} onSelect={onPickDay} />
          </Suspense>
        ) : (
          <Heatmap days={calendar.days} onSelect={onPickDay} />
        )}
      </div>

      <div className="section-title">
        <h2>Recent activity</h2>
        <span className="muted">
          {window.from
            ? `${window.from} → ${window.to} · ${window.days} days of public events`
            : "no recent public events"}
        </span>
      </div>

      <GameCard report={report} />

      <div className="grid">
        <div className="card col-8">
          <h3>Daily contributions · last 30 days</h3>
          <div style={{ height: 280 }}>
            {calendar.days.length ? (
              <DailyChart byDay={byDay} days={calendar.days} />
            ) : (
              <p className="muted">No contributions to chart.</p>
            )}
          </div>
        </div>
        <div className="card col-4">
          <h3>Contribution mix</h3>
          <div style={{ height: 280 }}>
            <TypeDoughnut byType={byType} />
          </div>
        </div>

        <div className="card col-6">
          <h3>Top projects (recent)</h3>
          {repoBars.length ? (
            <Bars data={repoBars} />
          ) : (
            <p className="muted">No recent project activity.</p>
          )}
        </div>
        <div className="card col-6">
          <h3>Top languages</h3>
          {langBars.length ? (
            <Bars data={langBars} />
          ) : (
            <p className="muted">No public repositories with a primary language.</p>
          )}
        </div>

        <div className="card col-4">
          <h3>Contribution personality</h3>
          <div style={{ height: 260 }}>
            <TypeRadar byType={byType} />
          </div>
        </div>
        <div className="card col-4">
          <h3>Weekly rhythm</h3>
          <div style={{ height: 260 }}>
            <WeekdayBars days={calendar.days} />
          </div>
        </div>
        <div className="card col-4">
          <h3>Contributions by year</h3>
          <div style={{ height: 260 }}>
            {Object.keys(calendar.totalByYear).length ? (
              <YearBars totalByYear={calendar.totalByYear} />
            ) : (
              <p className="muted">No yearly data.</p>
            )}
          </div>
        </div>

        {report.yearRepos && report.yearRepos.length > 0 && (
          <div className="card col-12">
            <h3>Top repositories · last year (commits, via token)</h3>
            <Bars
              data={report.yearRepos.slice(0, 12).map((r) => ({
                name: r.repo,
                value: r.commits,
                href: r.repoUrl,
              }))}
            />
          </div>
        )}

        <div className="card col-12">
          <h3>Latest events</h3>
          <Feed events={report.events.slice(0, 40)} />
        </div>
      </div>
    </>
  );
}

function DayView({
  report,
  date,
}: {
  report: Report;
  date: string | null;
}) {
  const data = useMemo(() => {
    if (!date) return null;
    const events = report.events.filter((e) => e.date === date);
    const byType: Record<ContributionType, number> = {
      commit: 0,
      pullRequest: 0,
      issue: 0,
      review: 0,
      other: 0,
    };
    const repoTotals = new Map<string, { url: string; total: number }>();
    for (const e of events) {
      if (e.weight > 0) byType[e.type] += e.weight;
      const r = repoTotals.get(e.repo) ?? { url: e.repoUrl, total: 0 };
      r.total += e.weight;
      repoTotals.set(e.repo, r);
    }
    const calCount =
      report.calendar.days.find((d) => d.date === date)?.count ?? null;
    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    const repoBars: BarDatum[] = [...repoTotals.entries()]
      .map(([name, v]) => ({ name, value: v.total, href: v.url }))
      .sort((a, b) => b.value - a.value);
    return { events, byType, total, calCount, repoBars };
  }, [report, date]);

  if (!date) {
    return (
      <div className="card">
        <p className="muted">Pick a date above to see that day's work.</p>
      </div>
    );
  }
  if (!data) return null;

  const pretty = new Date(date + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const hasEvents = data.events.length > 0;
  const calCount = data.calCount ?? 0;

  return (
    <>
      <div className="section-title">
        <h2>{pretty}</h2>
        <span className="muted">
          {data.calCount != null
            ? `${calCount} contribution${calCount === 1 ? "" : "s"} on the calendar`
            : "not on the contribution calendar"}
        </span>
      </div>

      {hasEvents ? (
        <>
          <div className="stats">
            <StatTile className="glow-cyan" icon="⬆️" value={String(data.byType.commit)} label="Commits" />
            <StatTile className="glow-violet" icon="🔀" value={String(data.byType.pullRequest)} label="Pull requests" />
            <StatTile className="glow-amber" icon="🐛" value={String(data.byType.issue)} label="Issues" />
            <StatTile className="glow-green" icon="👀" value={String(data.byType.review)} label="Reviews" />
            <StatTile className="glow-magenta" icon="📦" value={String(data.repoBars.length)} label="Projects touched" />
          </div>

          <div className="grid">
            <div className="card col-5">
              <h3>Projects this day</h3>
              {data.repoBars.length ? (
                <Bars data={data.repoBars} />
              ) : (
                <p className="muted">No per-project events recorded.</p>
              )}
            </div>
            <div className="card col-7">
              <h3>What happened</h3>
              <Feed events={data.events} />
            </div>
          </div>
        </>
      ) : (
        <div className="card day-empty">
          <div className="day-empty-count">{calCount}</div>
          <div className="day-empty-label">
            contribution{calCount === 1 ? "" : "s"} on the contribution calendar
          </div>
          <p className="muted">
            {calCount > 0
              ? "Per-project and per-commit detail comes from GitHub's public events feed, which only reaches back about 90 days (roughly 300 events). This day is outside that window, so only the calendar total is available."
              : "No public contributions recorded on this day."}
          </p>
        </div>
      )}
    </>
  );
}

