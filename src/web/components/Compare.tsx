import { Suspense } from "react";
import { derivePersona, Report } from "../../core/index.js";
import { Skyline3D } from "./Skyline3D.js";

interface Props {
  a: Report;
  b: Report;
  onExit: () => void;
}

function busiestDay(r: Report): number {
  return r.calendar.days.reduce((m, d) => (d.count > m ? d.count : m), 0);
}

interface Metric {
  label: string;
  a: number;
  b: number;
  format?: (n: number) => string;
}

export function Compare({ a, b, onExit }: Props) {
  const personaA = derivePersona(a);
  const personaB = derivePersona(b);
  // Shared height reference so both skylines are visually comparable.
  const scaleMax = Math.max(1, busiestDay(a), busiestDay(b));

  const metrics: Metric[] = [
    { label: "All-time contributions", a: a.calendar.total, b: b.calendar.total },
    { label: "Current streak (days)", a: a.calendar.currentStreak, b: b.calendar.currentStreak },
    { label: "Longest streak (days)", a: a.calendar.longestStreak, b: b.calendar.longestStreak },
    { label: "Active days", a: a.calendar.activeDays, b: b.calendar.activeDays },
    { label: "Best day", a: a.calendar.bestDay?.count ?? 0, b: b.calendar.bestDay?.count ?? 0 },
    { label: "Followers", a: a.profile.followers, b: b.profile.followers },
    { label: "Public repos", a: a.profile.publicRepos, b: b.profile.publicRepos },
  ];

  return (
    <div className="compare">
      <div className="compare-head">
        <h2>Head to head</h2>
        <button className="share-btn" onClick={onExit}>
          ← Back
        </button>
      </div>

      <div className="compare-people">
        {[
          { r: a, p: personaA },
          { r: b, p: personaB },
        ].map(({ r, p }) => (
          <div className="compare-person" key={r.profile.login}>
            <img src={r.profile.avatarUrl} alt={r.profile.login} />
            <div className="cp-emoji">{p.emoji}</div>
            <div className="cp-name">{r.profile.name ?? r.profile.login}</div>
            <a
              className="cp-handle"
              href={r.profile.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              @{r.profile.login}
            </a>
            <div className="cp-title">{p.title}</div>
          </div>
        ))}
      </div>

      <div className="vs-table">
        {metrics.map((m) => {
          const aWins = m.a > m.b;
          const bWins = m.b > m.a;
          const fmt = m.format ?? ((n: number) => n.toLocaleString());
          return (
            <div className="vs-row" key={m.label}>
              <div className={`vs-a${aWins ? " win" : ""}`}>{fmt(m.a)}</div>
              <div className="vs-label">{m.label}</div>
              <div className={`vs-b${bWins ? " win" : ""}`}>{fmt(m.b)}</div>
            </div>
          );
        })}
      </div>

      <div className="compare-skylines">
        {[a, b].map((r) => (
          <div className="card" key={r.profile.login}>
            <div className="card-head">
              <h3>@{r.profile.login} · last 12 months</h3>
            </div>
            <Suspense
              fallback={<div className="skyline-loading muted">Rendering 3D…</div>}
            >
              <Skyline3D days={r.calendar.days} scaleMax={scaleMax} />
            </Suspense>
          </div>
        ))}
      </div>
      <p className="muted compare-note">
        Building heights share one scale, so the two cities are directly
        comparable.
      </p>
    </div>
  );
}
