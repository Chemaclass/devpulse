import { useMemo } from "react";
import { TReport } from "../../core/index.js";
import { deriveGamification } from "../achievements.js";
import { CountUp } from "./CountUp.js";
import { Icon } from "./Icon.js";

export function GameCard({ report }: { report: TReport }) {
  const g = useMemo(() => deriveGamification(report), [report]);
  const earned = g.badges.filter((b) => b.earned).length;
  return (
    <div className="game card">
      <div className="game-level">
        <div
          className="gl-ring"
          style={{ ["--pct" as string]: `${g.pctToNext}%` }}
        >
          <span className="gl-num">{g.level}</span>
          <span className="gl-lvl">LVL</span>
        </div>
        <div className="gl-info">
          <div className="gl-title">{g.title}</div>
          <div className="gl-sub muted">
            <CountUp value={g.score.toLocaleString()} /> activity points ·{" "}
            {earned}/{g.badges.length} achievements
          </div>
          <div
            className="gl-bar"
            title={`${Math.round(g.pctToNext)}% to level ${g.level + 1}`}
          >
            <div className="gl-fill" style={{ width: `${g.pctToNext}%` }} />
          </div>
          <div className="gl-next muted">
            {(g.nextLevelAt - g.score).toLocaleString()} points to level{" "}
            {g.level + 1}
          </div>
        </div>
      </div>
      <div className="game-badges">
        {g.badges.map((b) => (
          <div
            className={`badge${b.earned ? " earned" : ""}`}
            key={b.label}
            title={b.desc}
          >
            <span className="badge-icon">
              <Icon glyph={b.icon} label={b.label} />
            </span>
            <span className="badge-label">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
