import {
  lazy,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  derivePersona,
  emptyTypeRecord,
  getReport,
  GitHubError,
  parseUsername,
  parseUTCDate,
  todayISO,
  TPersona,
  TReport,
} from "../core/index.js";
import { Landing, Skeleton } from "./components/AppStates.js";
import { Bars, TBarDatum } from "./components/Bars.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Feed } from "./components/Feed.js";
import { GameCard } from "./components/GameCard.js";
import { ThemeToggle, TokenControl } from "./components/HeaderControls.js";
import { Heatmap } from "./components/Heatmap.js";
import { Icon } from "./components/Icon.js";
import { Persona } from "./components/Persona.js";
import { StatTile } from "./components/StatTile.js";
import { trackProfileView } from "./lib/cronitor.js";
import { apiFetch } from "./lib/githubFetch.js";
import { setQueryParam, syncUrl } from "./lib/url.js";
import { supportsWebGL } from "./lib/webgl.js";
import { useDismiss } from "./lib/useDismiss.js";
import { useToken } from "./token.js";

// three.js is heavy; only load it when the 3D view is shown.
const Skyline3D = lazy(() =>
  import("./components/Skyline3D.js").then((m) => ({ default: m.Skyline3D })),
);
const Compare = lazy(() =>
  import("./components/Compare.js").then((m) => ({ default: m.Compare })),
);

// Chart.js is only needed once a report renders (never on the landing page),
// so load it on demand. The five charts share one dynamic Charts chunk.
const DailyChart = lazy(() =>
  import("./components/Charts.js").then((m) => ({ default: m.DailyChart })),
);
const TypeDoughnut = lazy(() =>
  import("./components/Charts.js").then((m) => ({ default: m.TypeDoughnut })),
);
const TypeRadar = lazy(() =>
  import("./components/Charts.js").then((m) => ({ default: m.TypeRadar })),
);
const WeekdayBars = lazy(() =>
  import("./components/Charts.js").then((m) => ({ default: m.WeekdayBars })),
);
const YearBars = lazy(() =>
  import("./components/Charts.js").then((m) => ({ default: m.YearBars })),
);

type TMode = "overall" | "latest" | "date";
const EXAMPLES = ["torvalds", "gaearon", "chemaclass"];

const SITE = "https://chemaclass.github.io/devpulse/";

// One Share button that opens a small menu: copy link, challenge invite,
// or a README badge snippet.
function ShareTools({ login, persona }: { login: string; persona: TPersona }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reportUrl = `${window.location.origin}${window.location.pathname}?u=${login}`;
  useDismiss(wrapRef, open, () => setOpen(false));
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
        <Icon glyph="🔗" /> <span className="share-label">Share ▾</span>
      </button>
      {open && (
        <div className="share-menu">
          <button onClick={() => copy("link", reportUrl)}>
            {copied === "link" ? (
              <>
                <Icon glyph="✓" /> Copied
              </>
            ) : (
              <>
                <Icon glyph="🔗" /> Copy link
              </>
            )}
          </button>
          <button
            onClick={() =>
              copy(
                "challenge",
                `⚔️ Can you out-code @${login} on DevPulse? ${reportUrl}`,
              )
            }
          >
            {copied === "challenge" ? (
              <>
                <Icon glyph="✓" /> Copied
              </>
            ) : (
              <>
                <Icon glyph="⚔️" /> Copy challenge invite
              </>
            )}
          </button>
          <button onClick={() => copy("readme", badge)}>
            {copied === "readme" ? (
              <>
                <Icon glyph="✓" /> Copied
              </>
            ) : (
              <>
                <Icon glyph="📋" /> Copy README badge
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<TReport | null>(null);
  const [loading, setLoading] = useState(false);
  // The message plus what to offer about it: a spent rate limit is fixable
  // right here with a token, an ordinary failure is worth simply retrying.
  const [error, setError] = useState<{
    message: string;
    rateLimited: boolean;
    /** The username that failed, so retrying does not depend on the input. */
    username: string;
  } | null>(null);
  const [mode, setMode] = useState<TMode>("overall");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // A view (mode + day) read from the URL, applied once the report loads. The
  // ref mirrors it for the URL-sync effect below, which runs in the same commit
  // as the read and would otherwise still see the state as empty.
  const [pendingView, setPendingView] = useState<{
    mode: TMode;
    date: string | null;
  } | null>(null);
  const pendingViewRef = useRef<{ mode: TMode; date: string | null } | null>(
    null,
  );
  // Second user for side-by-side comparison.
  const [vsReport, setVsReport] = useState<TReport | null>(null);
  const [vsLoading, setVsLoading] = useState(false);
  const [vsError, setVsError] = useState<string | null>(null);
  const [pendingVs, setPendingVs] = useState<string | null>(null);
  // True while the report on screen is the interim one, still filling in.
  const [provisional, setProvisional] = useState(false);
  // Identifies the newest run, so a slower earlier one cannot overwrite it.
  const runId = useRef(0);
  const vsRunId = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search from anywhere, the way GitHub itself does. Typed
  // into a field it stays a "/", and Escape hands focus back to the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && el === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const { token, setPanelOpen } = useToken();

  /**
   * Load a profile. A fresh search drops any running comparison, but a
   * deep-linked one (?vs=) is handed in so it survives in the URL until it
   * has actually loaded — otherwise re-reading the URL, as the effect below
   * does on re-mount and on back/forward, would find the comparison gone.
   */
  async function run(
    raw: string,
    keepVs: string | null = null,
    { refresh = false }: { refresh?: boolean } = {},
  ) {
    const username = parseUsername(raw);
    if (!username) return;
    const id = ++runId.current;
    const current = () => runId.current === id;

    syncUrl(username);
    setLoading(true);
    setError(null);
    setReport(null);
    setProvisional(false);
    setMode("overall");
    setSelectedDate(null);
    setVsReport(null);
    setVsError(null);
    setQueryParam("vs", keepVs);
    try {
      // The interim report puts a profile on screen as soon as the recent
      // window is in; the full one replaces it when the history arrives.
      const r = await getReport(username, apiFetch, token, {
        refresh,
        onPartial: (partial) => {
          if (!current()) return;
          setReport(partial);
          setProvisional(true);
          setLoading(false);
        },
      });
      if (!current()) return;
      setReport(r);
      trackProfileView(r.profile.login);
    } catch (err) {
      if (!current()) return;
      const rateLimited =
        err instanceof GitHubError && err.kind === "rate_limited";
      setError({
        username,
        rateLimited,
        message: rateLimited
          ? "GitHub allows 60 requests an hour per IP without a token, and this one is spent."
          : err instanceof Error
            ? err.message
            : String(err),
      });
    } finally {
      if (current()) {
        setProvisional(false);
        setLoading(false);
      }
    }
  }

  async function runVs(raw: string) {
    const username = parseUsername(raw);
    if (!username) return;
    // Comparisons get the same guard as the main lookup: two in quick
    // succession must not let the slower one land on top of the newer.
    const id = ++vsRunId.current;
    const current = () => vsRunId.current === id;

    setVsLoading(true);
    setVsError(null);
    try {
      const r = await getReport(username, apiFetch, token);
      if (!current()) return;
      setVsReport(r);
      setQueryParam("vs", r.profile.login);
      trackProfileView(r.profile.login, "compare");
    } catch (err) {
      if (!current()) return;
      setVsError(
        err instanceof GitHubError && err.kind === "rate_limited"
          ? "GitHub's hourly limit is spent — a token in the key menu lifts it."
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      if (current()) setVsLoading(false);
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

  // Re-fetch the current report when the token changes, so saving a token
  // immediately upgrades the data (year stats) without a manual re-run.
  const tokenRef = useRef(token);
  useEffect(() => {
    if (tokenRef.current === token) return;
    tokenRef.current = token;
    if (report) run(report.profile.login);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Deep-link support: load ?u=<name> with an optional view (?mode=latest or
  // ?d=<date>) and optional ?vs=<name> on first paint and on back/forward.
  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams(window.location.search);
      const u = params.get("u");
      if (!u) return;
      const d = params.get("d");
      const m: TMode = d
        ? "date"
        : params.get("mode") === "latest"
          ? "latest"
          : "overall";
      const vs = params.get("vs");
      setQuery(u);
      pendingViewRef.current = { mode: m, date: d };
      setPendingView({ mode: m, date: d });
      setPendingVs(vs);
      run(u, vs);
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
      pendingViewRef.current = null;
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

  // Keep the URL in sync with the current view (mode + selected day). Held
  // back while a deep-linked view is still waiting for its report: the state
  // says "overall" until then, and writing that out would strip the ?d= or
  // ?mode= that is about to be applied — losing it for anything that re-reads
  // the URL first (a re-mount, or back/forward).
  useEffect(() => {
    if (pendingViewRef.current) return;
    setQueryParam("d", mode === "date" ? selectedDate : null);
    setQueryParam("mode", mode === "latest" ? "latest" : null);
  }, [mode, selectedDate, pendingView]);

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
          Dev
          <span className="spark">
            <Icon glyph="⚡" />
          </span>
          Pulse
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
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="github username or profile URL…"
            aria-label="GitHub username or profile URL"
            aria-keyshortcuts="/"
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
          <kbd className="search-kbd" aria-hidden="true">
            /
          </kbd>
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
              {i < EXAMPLES.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </header>

      {loading && <Skeleton />}

      {error && !loading && (
        <div className="card error" role="alert">
          <h3>Couldn't load that profile</h3>
          <p className="muted">{error.message}</p>
          <div className="error-actions">
            <button
              className="share-btn"
              onClick={() => run(error.username, null, { refresh: true })}
            >
              <Icon glyph="↻" /> Try again
            </button>
            {error.rateLimited && (
              <button className="share-btn" onClick={() => setPanelOpen(true)}>
                <Icon glyph="🔑" /> Add a token
              </button>
            )}
          </div>
          {error.rateLimited && (
            <p className="muted tp-note">
              A personal token lifts the limit to 5,000 requests an hour. It
              stays in this browser tab and is only ever sent to GitHub.
            </p>
          )}
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
          provisional={provisional}
          onRetry={() => run(report.profile.login, null, { refresh: true })}
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
          . No token required, nothing stored.
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
            <Icon glyph="♥" /> Sponsor
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
      <span className="cb-label">
        <Icon glyph="⚔️" /> Compare with
      </span>
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
  provisional,
  onRetry,
  mode,
  setMode,
  selectedDate,
  setSelectedDate,
  onCompare,
  vsLoading,
  vsError,
}: {
  report: TReport;
  /** The interim report is showing: some sections are still arriving. */
  provisional: boolean;
  /** Fetch the whole report again, ignoring what is cached. */
  onRetry: () => void;
  mode: TMode;
  setMode: (m: TMode) => void;
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
    const mostRecent = report.byDay[0];
    if (mostRecent) return mostRecent.date;
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
              <span className="chip">
                <Icon glyph="🏢" /> {profile.company}
              </span>
            )}
            {profile.location && (
              <span className="chip">
                <Icon glyph="📍" /> {profile.location}
              </span>
            )}
            {profile.createdAt && (
              <span className="chip">
                <Icon glyph="🌱" /> Since {profile.createdAt.slice(0, 4)}
              </span>
            )}
            <a
              className="chip chip-link"
              href={`${profile.htmlUrl}?tab=achievements`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon glyph="🏅" /> Achievements →
            </a>
          </div>
        </div>
        <div className="spacer" />
      </div>

      <div className="view-bar">
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
              max={todayISO()}
              onChange={(e) => setSelectedDate(e.target.value || null)}
            />
          )}
        </div>
        <ShareTools login={profile.login} persona={persona} />
      </div>

      <CompareBar onCompare={onCompare} loading={vsLoading} error={vsError} />

      {mode === "overall" ? (
        <OverallView
          report={report}
          provisional={provisional}
          onPickDay={(d) => {
            setMode("date");
            setSelectedDate(d);
          }}
        />
      ) : (
        <DayView report={report} date={activeDate} />
      )}

      {report.notes.map((n, i) => (
        <p className="note" key={i}>
          <Icon glyph="ℹ️" /> {n}
        </p>
      ))}

      {/* The gap is usually a passing upstream failure, so offer the retry
          here instead of asking the reader to reload the page themselves. */}
      {!provisional && !calendar.complete && (
        <p className="note note-action">
          <button className="share-btn" onClick={onRetry}>
            <Icon glyph="↻" /> Try the missing years again
          </button>
        </p>
      )}
    </>
  );
}

/**
 * A slot for a lazily-loaded chart. Holds the chart's height only when there
 * is a chart in it: an empty grid reads as data rather than the absence of it,
 * and a one-line message does not need 280px of card to sit in.
 */
function ChartSlot({
  has,
  height,
  empty = "Nothing to chart yet.",
  children,
}: {
  has: boolean;
  height: number;
  empty?: string;
  children: ReactNode;
}) {
  if (!has) return <p className="muted">{empty}</p>;
  return (
    <div style={{ height }}>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}

function OverallView({
  report,
  provisional,
  onPickDay,
}: {
  report: TReport;
  provisional: boolean;
  onPickDay: (date: string) => void;
}) {
  const { calendar, byType, byRepo, byDay, window } = report;

  const repoBars: TBarDatum[] = byRepo
    .slice(0, 10)
    .map((r) => ({ name: r.repo, value: r.total, href: r.repoUrl }));

  const langBars: TBarDatum[] = report.languages
    .slice(0, 8)
    .map((l) => ({ name: l.language, value: l.repos }));

  // With a token, the GraphQL year stats are far more representative than the
  // ~90-day public events feed, so prefer them for mix + top projects.
  const yearStats = report.yearStats;
  const mixByType = yearStats?.byType ?? byType;
  const mixSuffix = yearStats ? " · last year" : "";
  const projectBars: TBarDatum[] = yearStats
    ? yearStats.topRepos
        .slice(0, 10)
        .map((r) => ({ name: r.repo, value: r.total, href: r.repoUrl }))
    : repoBars;

  const persona = useMemo(() => derivePersona(report), [report]);
  // chart.js draws an empty grid — or, on a radar, a shape — when every value
  // is zero, which reads as data rather than the absence of it.
  const hasMix = Object.values(mixByType).some((n) => n > 0);
  const hasCalendar = calendar.total > 0;
  // The daily chart's own window: a dormant account can have years of history
  // and still nothing in the last thirty days.
  const hasRecentDays = useMemo(() => {
    const today = todayISO();
    const recent = calendar.days.filter((d) => d.date <= today).slice(-30);
    const tracked = new Set(
      byDay.filter((d) => d.total > 0).map((d) => d.date),
    );
    return recent.some((d) => d.count > 0 || tracked.has(d.date));
  }, [calendar.days, byDay]);
  // Default to the 3D view only where it can actually draw; the boundary
  // below still covers a context that is lost or refused later on.
  const canRender3D = supportsWebGL();
  const [view, setView] = useState<"3d" | "grid">(canRender3D ? "3d" : "grid");

  return (
    <>
      <Persona persona={persona} login={report.profile.login} />

      <div className="stats">
        <StatTile
          className="glow-cyan"
          icon="🔥"
          value={calendar.total.toLocaleString()}
          label={
            provisional
              ? "Contributions so far…"
              : calendar.complete
                ? "All-time contributions"
                : "Contributions (partial history)"
          }
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
          value={calendar.bestDay ? String(calendar.bestDay.count) : "—"}
          label="Best day"
          sub={calendar.bestDay?.date ?? "no contributions yet"}
        />
      </div>

      <div className="card col-12" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Contributions · last 12 months</h3>
          <div className="view-toggle">
            <button
              className={view === "3d" ? "active" : ""}
              onClick={() => setView("3d")}
              disabled={!canRender3D}
              title={
                canRender3D ? undefined : "This browser has no WebGL support"
              }
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
          // three.js throws during render when it loses or cannot get a
          // context. Without a boundary that throw unmounts the entire report,
          // leaving a blank page instead of a profile.
          <ErrorBoundary
            fallback={<Heatmap days={calendar.days} onSelect={onPickDay} />}
            onError={() => setView("grid")}
          >
            <Suspense
              fallback={
                <div className="skyline-loading muted">Rendering 3D…</div>
              }
            >
              <Skyline3D days={calendar.days} onSelect={onPickDay} />
            </Suspense>
          </ErrorBoundary>
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
          <ChartSlot
            has={hasRecentDays}
            height={280}
            empty="Nothing in the last 30 days."
          >
            <DailyChart byDay={byDay} days={calendar.days} />
          </ChartSlot>
        </div>
        <div className="card col-4">
          <h3>Contribution mix{mixSuffix}</h3>
          <ChartSlot has={hasMix} height={280}>
            <TypeDoughnut byType={mixByType} />
          </ChartSlot>
        </div>

        <div className="card col-6">
          <h3>Top projects{mixSuffix || " (recent)"}</h3>
          {projectBars.length ? (
            <Bars data={projectBars} />
          ) : (
            <p className="muted">No project activity.</p>
          )}
        </div>
        <div className="card col-6">
          <h3>Top languages</h3>
          {langBars.length ? (
            <Bars data={langBars} />
          ) : provisional ? (
            // Absent because the repo pages are still in flight, not because
            // there is nothing to show — don't state the latter yet.
            <p className="muted">Loading…</p>
          ) : (
            <p className="muted">
              No public repositories with a primary language.
            </p>
          )}
        </div>

        <div className="card col-4">
          <h3>Contribution personality</h3>
          <ChartSlot has={hasMix} height={260}>
            <TypeRadar byType={mixByType} />
          </ChartSlot>
        </div>
        <div className="card col-4">
          <h3>Weekly rhythm</h3>
          <ChartSlot has={hasCalendar} height={260}>
            <WeekdayBars days={calendar.days} />
          </ChartSlot>
        </div>
        <div className="card col-4">
          <h3>Contributions by year</h3>
          <ChartSlot
            has={hasCalendar && Object.keys(calendar.totalByYear).length > 0}
            height={260}
          >
            <YearBars totalByYear={calendar.totalByYear} />
          </ChartSlot>
        </div>

        <div className="card col-12">
          <h3>Latest events</h3>
          <Feed events={report.events.slice(0, 40)} />
        </div>
      </div>
    </>
  );
}

function DayView({ report, date }: { report: TReport; date: string | null }) {
  const data = useMemo(() => {
    if (!date) return null;
    const events = report.events.filter((e) => e.date === date);
    const byType = emptyTypeRecord();
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
    const repoBars: TBarDatum[] = [...repoTotals.entries()]
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

  const pretty = parseUTCDate(date).toLocaleDateString(undefined, {
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
            <StatTile
              className="glow-cyan"
              icon="⬆️"
              value={String(data.byType.commit)}
              label="Commits"
            />
            <StatTile
              className="glow-violet"
              icon="🔀"
              value={String(data.byType.pullRequest)}
              label="Pull requests"
            />
            <StatTile
              className="glow-amber"
              icon="🐛"
              value={String(data.byType.issue)}
              label="Issues"
            />
            <StatTile
              className="glow-green"
              icon="👀"
              value={String(data.byType.review)}
              label="Reviews"
            />
            <StatTile
              className="glow-magenta"
              icon="📦"
              value={String(data.repoBars.length)}
              label="Projects touched"
            />
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
