// Empty (landing) and loading (skeleton) states for the app shell.

import { Icon } from "./Icon.js";

const FEATURES = [
  {
    icon: "🌳",
    title: "A full year at a glance",
    body: "Every public contribution as a rotatable 3D forest, with streaks, peak days and month-by-month rhythm.",
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

export function Landing() {
  return (
    <div className="landing">
      {FEATURES.map((f) => (
        <div className="landing-card" key={f.title}>
          <span className="landing-icon">
            <Icon glyph={f.icon} />
          </span>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export function Skeleton() {
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
