import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ContributionType,
  derivePersona,
  getReport,
  GitHubError,
  parseUsername,
  Report,
} from "../core/index.js";
import { Bars, BarDatum } from "./components/Bars.js";
import { DailyStackedChart, TypeDoughnut } from "./components/Charts.js";
import { CountUp } from "./components/CountUp.js";
import { Feed } from "./components/Feed.js";
import { Heatmap } from "./components/Heatmap.js";
import { Persona } from "./components/Persona.js";
import { useTheme } from "./theme.js";

// three.js is heavy; only load it when the 3D view is shown.
const Skyline3D = lazy(() =>
  import("./components/Skyline3D.js").then((m) => ({ default: m.Skyline3D })),
);

type Mode = "overall" | "latest" | "date";
const EXAMPLES = ["torvalds", "gaearon", "sindresorhus", "chemaclass"];

/** Reflect the current username in the URL so results are shareable. */
function syncUrl(username: string) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("u") === username) return;
  params.set("u", username);
  window.history.pushState({}, "", `?${params.toString()}`);
}

const FEATURES = [
  {
    icon: "🌳",
    title: "A full year at a glance",
    body: "Every public contribution as a living heatmap, with streaks, peak days and month-by-month rhythm.",
  },
  {
    icon: "🧬",
    title: "Your developer archetype",
    body: "Shipper, Guardian, Machine… a playful read on how someone works, drawn from real activity.",
  },
  {
    icon: "🔗",
    title: "Shareable, no login",
    body: "Public data only. Every report is a clean link you can send to anyone, nothing stored.",
  },
];

function Landing() {
  return (
    <div className="landing">
      {FEATURES.map((f) => (
        <div className="landing-card" key={f.title}>
          <span className="landing-icon">{f.icon}</span>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading report">
      <div className="sk-profile">
        <div className="sk sk-avatar" />
        <div className="sk-lines">
          <div className="sk sk-line w50" />
          <div className="sk sk-line w30" />
        </div>
      </div>
      <div className="sk sk-persona" />
      <div className="sk-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="sk sk-tile" key={i} />
        ))}
      </div>
      <div className="sk sk-heatmap" />
      <p className="sk-note muted">Pulling public contributions…</p>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}

function ShareButton({ login }: { login: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${window.location.pathname}?u=${login}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked, ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button className="share-btn" onClick={copy} title="Copy a link to this report">
      {copied ? "✓ Copied" : "🔗 Share"}
    </button>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("overall");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function run(raw: string) {
    const username = parseUsername(raw);
    if (!username) return;
    syncUrl(username);
    setLoading(true);
    setError(null);
    setReport(null);
    setMode("overall");
    setSelectedDate(null);
    try {
      const r = await getReport(username);
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

  // Deep-link support: load ?u=<name> on first paint and on back/forward.
  useEffect(() => {
    const load = () => {
      const u = new URLSearchParams(window.location.search).get("u");
      if (u) {
        setQuery(u);
        run(u);
      }
    };
    load();
    window.addEventListener("popstate", load);
    return () => window.removeEventListener("popstate", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shell">
      <ThemeToggle />
      <header className="hero">
        <h1 className="logo">
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

      {report && !loading && (
        <Dashboard
          report={report}
          mode={mode}
          setMode={setMode}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
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
      </footer>
    </div>
  );
}

function Dashboard({
  report,
  mode,
  setMode,
  selectedDate,
  setSelectedDate,
}: {
  report: Report;
  mode: Mode;
  setMode: (m: Mode) => void;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
}) {
  const { profile, calendar } = report;

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
          </div>
        </div>
        <div className="spacer" />
        <ShareButton login={profile.login} />
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

      <div className="grid">
        <div className="card col-8">
          <h3>Daily contributions by type</h3>
          <div style={{ height: 280 }}>
            {byDay.length ? (
              <DailyStackedChart byDay={byDay} />
            ) : (
              <p className="muted">No recent events to chart.</p>
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

  const pretty = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const beyondEvents =
    data.events.length === 0 && (data.calCount ?? 0) > 0;

  return (
    <>
      <div className="section-title">
        <h2>{pretty}</h2>
        <span className="muted">
          {data.calCount != null
            ? `${data.calCount} contribution${data.calCount === 1 ? "" : "s"} on the calendar`
            : ""}
        </span>
      </div>

      <div className="stats">
        <StatTile className="glow-cyan" icon="⬆️" value={String(data.byType.commit)} label="Commits" />
        <StatTile className="glow-violet" icon="🔀" value={String(data.byType.pullRequest)} label="Pull requests" />
        <StatTile className="glow-amber" icon="🐛" value={String(data.byType.issue)} label="Issues" />
        <StatTile className="glow-green" icon="👀" value={String(data.byType.review)} label="Reviews" />
        <StatTile className="glow-magenta" icon="📦" value={String(data.repoBars.length)} label="Projects touched" />
      </div>

      {beyondEvents && (
        <p className="note">
          ℹ️ The contribution calendar shows {data.calCount} contribution(s) this
          day, but GitHub's public events feed (≈ last 90 days, ~300 events)
          doesn't include the per-project detail for it — likely older than the
          events window or from private contributions.
        </p>
      )}

      <div className="grid">
        <div className="card col-5">
          <h3>Projects this day</h3>
          {data.repoBars.length ? (
            <Bars data={data.repoBars} />
          ) : (
            <p className="muted">No per-project events recorded for this day.</p>
          )}
        </div>
        <div className="card col-7">
          <h3>What happened</h3>
          <Feed events={data.events} />
        </div>
      </div>
    </>
  );
}

function StatTile({
  className,
  icon,
  value,
  label,
  sub,
}: {
  className?: string;
  icon: string;
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className={`stat ${className ?? ""}`}>
      <span className="spark-icon">{icon}</span>
      <div className="value">
        <CountUp value={value} />
      </div>
      <div className="label">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
