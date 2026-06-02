// Derives a fun "developer archetype" from a Report.
// Pure and dependency-free so both the web app and the CLI can use it.

import { ActivityEvent, ContributionType, Report } from "./types.js";

export interface PersonaTrait {
  icon: string;
  label: string;
  value: string;
}

export interface Persona {
  emoji: string;
  title: string;
  tagline: string;
  /** css accent class, matches the glow-* helpers in styles.css */
  accent: string;
  traits: PersonaTrait[];
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function chronotype(hour: number): { emoji: string; label: string } {
  if (hour >= 0 && hour < 5) return { emoji: "🦉", label: "Night Owl" };
  if (hour >= 5 && hour < 9) return { emoji: "🐓", label: "Early Bird" };
  if (hour >= 9 && hour < 17) return { emoji: "☀️", label: "Daylight Coder" };
  if (hour >= 17 && hour < 21) return { emoji: "🌆", label: "Evening Hacker" };
  return { emoji: "🌙", label: "Late Nighter" };
}

function peakHour(events: ActivityEvent[]): number | null {
  if (!events.length) return null;
  const buckets = new Array(24).fill(0);
  for (const e of events) {
    const h = new Date(e.datetime).getUTCHours();
    if (!Number.isNaN(h)) buckets[h] += Math.max(1, e.weight);
  }
  let best = 0;
  for (let h = 1; h < 24; h++) if (buckets[h] > buckets[best]) best = h;
  return buckets[best] > 0 ? best : null;
}

function favoriteWeekday(events: ActivityEvent[]): number | null {
  if (!events.length) return null;
  const buckets = new Array(7).fill(0);
  for (const e of events) {
    const d = new Date(e.datetime).getUTCDay();
    if (!Number.isNaN(d)) buckets[d] += Math.max(1, e.weight);
  }
  let best = 0;
  for (let d = 1; d < 7; d++) if (buckets[d] > buckets[best]) best = d;
  return buckets[best] > 0 ? best : null;
}

function weekendShare(events: ActivityEvent[]): number {
  if (!events.length) return 0;
  let weekend = 0;
  let total = 0;
  for (const e of events) {
    const d = new Date(e.datetime).getUTCDay();
    const w = Math.max(1, e.weight);
    total += w;
    if (d === 0 || d === 6) weekend += w;
  }
  return total ? weekend / total : 0;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

interface Archetype {
  emoji: string;
  title: string;
  tagline: string;
  accent: string;
}

function pickArchetype(
  byType: Record<ContributionType, number>,
  total: number,
): Archetype {
  if (total === 0) {
    return {
      emoji: "🌱",
      title: "The Quiet Builder",
      tagline: "Steady work, no noise in the public feed.",
      accent: "glow-green",
    };
  }
  const share = (t: ContributionType) => byType[t] / total;
  const commit = share("commit");
  const pr = share("pullRequest");
  const issue = share("issue");
  const review = share("review");

  // Reviews are rarer, so a smaller share still signals a reviewer.
  if (review >= 0.2 && review >= pr && review >= issue) {
    return {
      emoji: "🛡️",
      title: "The Guardian",
      tagline: "Nothing ships without a careful read.",
      accent: "glow-cyan",
    };
  }
  if (pr >= 0.35 && pr >= commit) {
    return {
      emoji: "🚀",
      title: "The Shipper",
      tagline: "Branch, PR, merge, repeat.",
      accent: "glow-violet",
    };
  }
  if (issue >= 0.3 && issue >= commit) {
    return {
      emoji: "🗺️",
      title: "The Planner",
      tagline: "Maps the work before the code lands.",
      accent: "glow-amber",
    };
  }
  if (commit >= 0.6) {
    return {
      emoji: "🔨",
      title: "The Machine",
      tagline: "Commits like breathing.",
      accent: "glow-magenta",
    };
  }
  return {
    emoji: "🎛️",
    title: "The All-Rounder",
    tagline: "Commits, reviews, issues, all of it.",
    accent: "glow-cyan",
  };
}

export function derivePersona(report: Report): Persona {
  const { events, byType, calendar } = report;
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  const arch = pickArchetype(byType, total);

  const traits: PersonaTrait[] = [];

  const ph = peakHour(events);
  if (ph != null) {
    const chrono = chronotype(ph);
    traits.push({
      icon: chrono.emoji,
      label: chrono.label,
      value: `Peak ${pad2(ph)}:00 to ${pad2((ph + 1) % 24)}:00 UTC`,
    });
  }

  const fav = favoriteWeekday(events);
  if (fav != null) {
    traits.push({
      icon: "📆",
      label: "Favorite day",
      value: WEEKDAY_NAMES[fav],
    });
  }

  const wknd = weekendShare(events);
  if (events.length) {
    traits.push({
      icon: wknd >= 0.3 ? "🏖️" : "💼",
      label: wknd >= 0.3 ? "Weekend Warrior" : "Weekday Worker",
      value: `${Math.round(wknd * 100)}% on weekends`,
    });
  }

  if (calendar.currentStreak > 0) {
    traits.push({
      icon: "🔥",
      label: "On a streak",
      value: `${calendar.currentStreak} day${
        calendar.currentStreak === 1 ? "" : "s"
      } (best ${calendar.longestStreak})`,
    });
  }

  return {
    emoji: arch.emoji,
    title: arch.title,
    tagline: arch.tagline,
    accent: arch.accent,
    traits,
  };
}
