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

interface Rhythm {
  peakHour: number | null;
  favWeekday: number | null;
  weekendShare: number;
}

/** Single pass over events: peak hour, favorite weekday, weekend share. */
function analyzeRhythm(events: ActivityEvent[]): Rhythm {
  const hours = new Array(24).fill(0);
  const days = new Array(7).fill(0);
  let weekend = 0;
  let total = 0;
  for (const e of events) {
    const t = new Date(e.datetime);
    const h = t.getUTCHours();
    const d = t.getUTCDay();
    if (Number.isNaN(h) || Number.isNaN(d)) continue;
    const w = Math.max(1, e.weight);
    hours[h] += w;
    days[d] += w;
    total += w;
    if (d === 0 || d === 6) weekend += w;
  }
  const argmax = (a: number[]) =>
    a.reduce((best, v, i) => (v > a[best] ? i : best), 0);
  const ph = argmax(hours);
  const fd = argmax(days);
  return {
    peakHour: hours[ph] > 0 ? ph : null,
    favWeekday: days[fd] > 0 ? fd : null,
    weekendShare: total ? weekend / total : 0,
  };
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
  const { peakHour, favWeekday, weekendShare } = analyzeRhythm(events);

  if (peakHour != null) {
    const chrono = chronotype(peakHour);
    traits.push({
      icon: chrono.emoji,
      label: chrono.label,
      value: `Peak ${pad2(peakHour)}:00 to ${pad2((peakHour + 1) % 24)}:00 UTC`,
    });
  }

  if (favWeekday != null) {
    traits.push({
      icon: "📆",
      label: "Favorite day",
      value: WEEKDAY_NAMES[favWeekday],
    });
  }

  if (events.length) {
    traits.push({
      icon: weekendShare >= 0.3 ? "🏖️" : "💼",
      label: weekendShare >= 0.3 ? "Weekend Warrior" : "Weekday Worker",
      value: `${Math.round(weekendShare * 100)}% on weekends`,
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
