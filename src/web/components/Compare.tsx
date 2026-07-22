import { Suspense, useState } from "react";
import { derivePersona, TPersona, TReport } from "../../core/index.js";
import { TypeRadarCompare, YearBarsCompare } from "./Charts.js";
import { CountUp } from "./CountUp.js";
import { Icon } from "./Icon.js";
import { Skyline3D } from "./Skyline3D.js";

const A_FILL = "rgba(111,176,106,0.22)";
const B_FILL = "rgba(224,138,79,0.22)";

type TProps = {
  a: TReport;
  b: TReport;
  onExit: () => void;
  /** Open one contender as their own dedicated DevPulse report. */
  onView: (login: string) => void;
};

// Contender colors carried everywhere: stats, bars and the 3D cities.
const A_ACCENT = "#6fae5f"; // leaf green
const B_ACCENT = "#e08a4f"; // terracotta
const A_RAMP = ["#1b2616", "#2f5138", "#46824f", "#6fae5f", "#a7d98a"];
const B_RAMP = ["#2a1c12", "#6e3f24", "#a85f33", "#e08a4f", "#f3b98a"];

function busiestDay(r: TReport): number {
  return r.calendar.days.reduce((m, d) => (d.count > m ? d.count : m), 0);
}

function trait(p: TPersona, label: string): string | undefined {
  return p.traits.find((t) => t.label === label)?.value;
}

type TFact = {
  icon: string;
  text: string;
};

/** Punchy comparative facts, computed and filtered to the interesting ones. */
function funFacts(a: TReport, b: TReport, pa: TPersona, pb: TPersona): TFact[] {
  const out: TFact[] = [];
  const al = a.profile.login;
  const bl = b.profile.login;
  const at = a.calendar.total;
  const bt = b.calendar.total;

  // Combined total.
  out.push({
    icon: "🤝",
    text: `Together they've logged ${(at + bt).toLocaleString()} contributions.`,
  });

  // Contribution ratio.
  const hi = at >= bt ? a : b;
  const lo = at >= bt ? b : a;
  const hiT = Math.max(at, bt);
  const loT = Math.min(at, bt);
  if (loT > 0 && hiT / loT >= 1.5) {
    out.push({
      icon: "🔥",
      text: `@${hi.profile.login} has ${(hiT / loT).toFixed(1)}× the all-time contributions of @${lo.profile.login}.`,
    });
  }

  // Longest streak.
  if (a.calendar.longestStreak !== b.calendar.longestStreak) {
    const s = a.calendar.longestStreak > b.calendar.longestStreak ? a : b;
    out.push({
      icon: "💎",
      text: `@${s.profile.login} owns the longer streak: ${Math.max(a.calendar.longestStreak, b.calendar.longestStreak)} vs ${Math.min(a.calendar.longestStreak, b.calendar.longestStreak)} days.`,
    });
  }

  // Best single day.
  const ba = a.calendar.bestDay?.count ?? 0;
  const bb = b.calendar.bestDay?.count ?? 0;
  if (ba !== bb) {
    const w = ba > bb ? al : bl;
    out.push({
      icon: "🏆",
      text: `@${w}'s busiest day hit ${Math.max(ba, bb)} contributions.`,
    });
  }

  // Favorite weekday.
  const fa = trait(pa, "Favorite day");
  const fb = trait(pb, "Favorite day");
  if (fa && fb) {
    out.push(
      fa === fb
        ? { icon: "📆", text: `Both ship most on ${fa}s.` }
        : { icon: "📆", text: `@${al} loves ${fa}s, @${bl} prefers ${fb}s.` },
    );
  }

  // Top language.
  const la = a.languages[0]?.language;
  const lb = b.languages[0]?.language;
  if (la && lb) {
    out.push(
      la === lb
        ? { icon: "💻", text: `${la} runs in both their veins.` }
        : { icon: "💻", text: `@${al} is mostly ${la}, @${bl} mostly ${lb}.` },
    );
  }

  // GitHub tenure.
  const ya = new Date(a.profile.createdAt).getUTCFullYear();
  const yb = new Date(b.profile.createdAt).getUTCFullYear();
  if (ya && yb && ya !== yb) {
    const older = ya < yb ? al : bl;
    out.push({
      icon: "🎂",
      text: `@${older} has been on GitHub since ${Math.min(ya, yb)}, ${Math.abs(ya - yb)} year${Math.abs(ya - yb) === 1 ? "" : "s"} longer.`,
    });
  }

  // Followers gap.
  const fwA = a.profile.followers;
  const fwB = b.profile.followers;
  const fHi = Math.max(fwA, fwB);
  const fLo = Math.min(fwA, fwB);
  if (fLo > 0 && fHi / fLo >= 2) {
    const w = fwA > fwB ? al : bl;
    out.push({
      icon: "🌍",
      text: `@${w} has ${(fHi / fLo).toFixed(1)}× the followers.`,
    });
  }

  return out.slice(0, 6);
}

type TMetric = {
  label: string;
  a: number;
  b: number;
};

export function Compare({ a, b, onExit, onView }: TProps) {
  const personaA = derivePersona(a);
  const personaB = derivePersona(b);
  const scaleMax = Math.max(1, busiestDay(a), busiestDay(b));

  const metrics: TMetric[] = [
    {
      label: "All-time contributions",
      a: a.calendar.total,
      b: b.calendar.total,
    },
    {
      label: "Current streak",
      a: a.calendar.currentStreak,
      b: b.calendar.currentStreak,
    },
    {
      label: "Longest streak",
      a: a.calendar.longestStreak,
      b: b.calendar.longestStreak,
    },
    {
      label: "Active days",
      a: a.calendar.activeDays,
      b: b.calendar.activeDays,
    },
    {
      label: "Best day",
      a: a.calendar.bestDay?.count ?? 0,
      b: b.calendar.bestDay?.count ?? 0,
    },
    { label: "Followers", a: a.profile.followers, b: b.profile.followers },
    {
      label: "Public repos",
      a: a.profile.publicRepos,
      b: b.profile.publicRepos,
    },
  ];

  const aWins = metrics.filter((m) => m.a > m.b).length;
  const bWins = metrics.filter((m) => m.b > m.a).length;
  const leader = aWins === bWins ? null : aWins > bWins ? a : b;

  const people = [
    { r: a, p: personaA, accent: A_ACCENT, wins: aWins, side: "a" as const },
    { r: b, p: personaB, accent: B_ACCENT, wins: bWins, side: "b" as const },
  ];

  const facts = funFacts(a, b, personaA, personaB);

  const verdict = leader
    ? `${leader.profile.login} leads ${Math.max(aWins, bWins)} to ${Math.min(aWins, bWins)}`
    : `Dead even, ${aWins} to ${bWins}`;

  const [copied, setCopied] = useState(false);
  function shareBattle() {
    const text = `⚔️ @${a.profile.login} vs @${b.profile.login} on DevPulse — ${verdict}! ${window.location.href}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="compare">
      <div className="compare-head">
        <h2>Head to head</h2>
        <div className="compare-head-actions">
          <button className="share-btn" onClick={shareBattle}>
            {copied ? (
              <>
                <Icon glyph="✓" /> Copied
              </>
            ) : (
              <>
                <Icon glyph="⚔️" /> Share battle
              </>
            )}
          </button>
          <button className="share-btn" onClick={onExit}>
            ← Back
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="scoreboard">
        {people.map(({ r, p, accent, wins }, i) => (
          <div className="sb-side" key={r.profile.login}>
            <div
              className={`sb-card${leader === r ? " sb-leader" : ""}`}
              style={{ borderColor: leader === r ? accent : undefined }}
            >
              {leader === r && (
                <div className="sb-crown">
                  <Icon glyph="👑" label="Leader" />
                </div>
              )}
              <img
                src={r.profile.avatarUrl}
                alt={r.profile.login}
                style={{ borderColor: accent }}
                className="sb-avatar"
                title={`View @${r.profile.login} on DevPulse`}
                onClick={() => onView(r.profile.login)}
              />
              <div className="sb-emoji">
                <Icon glyph={p.emoji} label={p.title} />
              </div>
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
              <a
                className="sb-ach"
                href={`${r.profile.htmlUrl}?tab=achievements`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon glyph="🏅" /> GitHub achievements
              </a>
              <div className="sb-wins" style={{ color: accent }}>
                {wins} <span>win{wins === 1 ? "" : "s"}</span>
              </div>
            </div>
            {i === 0 && <div className="sb-vs">VS</div>}
          </div>
        ))}
      </div>

      <div className="vs-verdict">{verdict}</div>

      {/* Fun facts */}
      <div className="fun-facts">
        {facts.map((f) => (
          <div className="fact" key={`${f.icon}-${f.text}`}>
            <span className="fact-icon">
              <Icon glyph={f.icon} />
            </span>
            <span className="fact-text">{f.text}</span>
          </div>
        ))}
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
                <span
                  className={`vm-val${aWin ? " win" : ""}`}
                  style={{ color: A_ACCENT }}
                >
                  <CountUp value={m.a.toLocaleString()} />
                </span>
                <span className="vm-label">{m.label}</span>
                <span
                  className={`vm-val${bWin ? " win" : ""}`}
                  style={{ color: B_ACCENT }}
                >
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

      {/* Overlaid charts */}
      <div className="compare-charts">
        <div className="card">
          <h3>Contribution personality</h3>
          <div style={{ height: 280 }}>
            <TypeRadarCompare
              a={{
                label: `@${a.profile.login}`,
                byType: a.byType,
                color: A_ACCENT,
                fill: A_FILL,
              }}
              b={{
                label: `@${b.profile.login}`,
                byType: b.byType,
                color: B_ACCENT,
                fill: B_FILL,
              }}
            />
          </div>
        </div>
        <div className="card">
          <h3>Contributions by year</h3>
          <div style={{ height: 280 }}>
            <YearBarsCompare
              a={{
                label: `@${a.profile.login}`,
                totalByYear: a.calendar.totalByYear,
                color: A_ACCENT,
              }}
              b={{
                label: `@${b.profile.login}`,
                totalByYear: b.calendar.totalByYear,
                color: B_ACCENT,
              }}
            />
          </div>
        </div>
      </div>

      {/* Color-matched cities */}
      <div className="compare-skylines">
        {people.map(({ r, accent, side }) => (
          <div className="card" key={r.profile.login}>
            <div className="card-head">
              <h3 style={{ color: accent }}>@{r.profile.login}</h3>
            </div>
            <Suspense
              fallback={
                <div className="skyline-loading muted">Rendering 3D…</div>
              }
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
        Tree heights share one scale, so the two forests are directly
        comparable.
      </p>
    </div>
  );
}
