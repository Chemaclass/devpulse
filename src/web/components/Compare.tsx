import { Suspense } from "react";
import { derivePersona, Report } from "../../core/index.js";
import { CountUp } from "./CountUp.js";
import { Skyline3D } from "./Skyline3D.js";

interface Props {
  a: Report;
  b: Report;
  onExit: () => void;
  /** Open one contender as their own dedicated DevPulse report. */
  onView: (login: string) => void;
}

// Contender colors carried everywhere: stats, bars and the 3D cities.
const A_ACCENT = "#6fae5f"; // leaf green
const B_ACCENT = "#e08a4f"; // terracotta
const A_RAMP = ["#1b2616", "#2f5138", "#46824f", "#6fae5f", "#a7d98a"];
const B_RAMP = ["#2a1c12", "#6e3f24", "#a85f33", "#e08a4f", "#f3b98a"];

function busiestDay(r: Report): number {
  return r.calendar.days.reduce((m, d) => (d.count > m ? d.count : m), 0);
}

interface Metric {
  label: string;
  a: number;
  b: number;
}

export function Compare({ a, b, onExit, onView }: Props) {
  const personaA = derivePersona(a);
  const personaB = derivePersona(b);
  const scaleMax = Math.max(1, busiestDay(a), busiestDay(b));

  const metrics: Metric[] = [
    { label: "All-time contributions", a: a.calendar.total, b: b.calendar.total },
    { label: "Current streak", a: a.calendar.currentStreak, b: b.calendar.currentStreak },
    { label: "Longest streak", a: a.calendar.longestStreak, b: b.calendar.longestStreak },
    { label: "Active days", a: a.calendar.activeDays, b: b.calendar.activeDays },
    { label: "Best day", a: a.calendar.bestDay?.count ?? 0, b: b.calendar.bestDay?.count ?? 0 },
    { label: "Followers", a: a.profile.followers, b: b.profile.followers },
    { label: "Public repos", a: a.profile.publicRepos, b: b.profile.publicRepos },
  ];

  const aWins = metrics.filter((m) => m.a > m.b).length;
  const bWins = metrics.filter((m) => m.b > m.a).length;
  const leader = aWins === bWins ? null : aWins > bWins ? a : b;

  const people = [
    { r: a, p: personaA, accent: A_ACCENT, wins: aWins, side: "a" as const },
    { r: b, p: personaB, accent: B_ACCENT, wins: bWins, side: "b" as const },
  ];

  return (
    <div className="compare">
      <div className="compare-head">
        <h2>Head to head</h2>
        <button className="share-btn" onClick={onExit}>
          ← Back
        </button>
      </div>

      {/* Scoreboard */}
      <div className="scoreboard">
        {people.map(({ r, p, accent, wins }, i) => (
          <div className="sb-side" key={r.profile.login}>
            <div
              className={`sb-card${leader === r ? " sb-leader" : ""}`}
              style={{ borderColor: leader === r ? accent : undefined }}
            >
              {leader === r && <div className="sb-crown">👑</div>}
              <img
                src={r.profile.avatarUrl}
                alt={r.profile.login}
                style={{ borderColor: accent }}
                className="sb-avatar"
                title={`View @${r.profile.login} on DevPulse`}
                onClick={() => onView(r.profile.login)}
              />
              <div className="sb-emoji">{p.emoji}</div>
              <div className="sb-name">{r.profile.name ?? r.profile.login}</div>
              <a
                className="sb-handle"
                href={r.profile.htmlUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: accent }}
              >
                @{r.profile.login}
              </a>
              <div className="sb-title">{p.title}</div>
              <div className="sb-wins" style={{ color: accent }}>
                {wins} <span>win{wins === 1 ? "" : "s"}</span>
              </div>
            </div>
            {i === 0 && <div className="sb-vs">VS</div>}
          </div>
        ))}
      </div>

      <div className="vs-verdict">
        {leader
          ? `${leader.profile.login} leads ${Math.max(aWins, bWins)} to ${Math.min(aWins, bWins)}`
          : `Dead even, ${aWins} to ${bWins}`}
      </div>

      {/* Tug-of-war metrics */}
      <div className="vs-metrics card">
        {metrics.map((m) => {
          const sum = m.a + m.b;
          const aPct = sum === 0 ? 50 : (m.a / sum) * 100;
          const aWin = m.a > m.b;
          const bWin = m.b > m.a;
          return (
            <div className="vs-metric" key={m.label}>
              <div className="vm-top">
                <span className={`vm-val${aWin ? " win" : ""}`} style={{ color: A_ACCENT }}>
                  <CountUp value={m.a.toLocaleString()} />
                </span>
                <span className="vm-label">{m.label}</span>
                <span className={`vm-val${bWin ? " win" : ""}`} style={{ color: B_ACCENT }}>
                  <CountUp value={m.b.toLocaleString()} />
                </span>
              </div>
              <div className="vm-bar">
                <div
                  className={`vm-fill${aWin ? " win" : ""}`}
                  style={{ width: `${aPct}%`, background: A_ACCENT }}
                />
                <div
                  className={`vm-fill${bWin ? " win" : ""}`}
                  style={{ width: `${100 - aPct}%`, background: B_ACCENT }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Color-matched cities */}
      <div className="compare-skylines">
        {people.map(({ r, accent, side }) => (
          <div className="card" key={r.profile.login}>
            <div className="card-head">
              <h3 style={{ color: accent }}>@{r.profile.login}</h3>
            </div>
            <Suspense
              fallback={<div className="skyline-loading muted">Rendering 3D…</div>}
            >
              <Skyline3D
                days={r.calendar.days}
                scaleMax={scaleMax}
                colors={side === "a" ? A_RAMP : B_RAMP}
              />
            </Suspense>
          </div>
        ))}
      </div>
      <p className="muted compare-note">
        Buildings share one height scale, so the two cities are directly
        comparable.
      </p>
    </div>
  );
}
