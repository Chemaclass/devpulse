// Derives a fun "developer archetype" from a Report.
// Pure and dependency-free so both the web app and the CLI can use it.

import {
  ActivityEvent,
  CalendarDay,
  ContributionType,
  Report,
} from "./types.js";

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

const argmax = (a: number[]) =>
  a.reduce((best, v, i) => (v > a[best] ? i : best), 0);

/**
 * Peak hour of day from the detailed events feed. This is the only source
 * with timestamps, so it can be null when there are no recent events.
 */
function peakHourFromEvents(events: ActivityEvent[]): number | null {
  const hours = new Array(24).fill(0);
  for (const e of events) {
    const h = new Date(e.datetime).getUTCHours();
    if (!Number.isNaN(h)) hours[h] += Math.max(1, e.weight);
  }
  const h = argmax(hours);
  return hours[h] > 0 ? h : null;
}

interface WeekdayProfile {
  favWeekday: number | null;
  weekendShare: number;
}

/**
 * Favorite weekday and weekend share from the full contribution calendar
 * (count-weighted). Far more representative than the ~90-day events feed,
 * which can be a single day and skew the numbers.
 */
function weekdayProfileFromCalendar(days: CalendarDay[]): WeekdayProfile {
  const buckets = new Array(7).fill(0);
  let weekend = 0;
  let total = 0;
  for (const d of days) {
    if (d.count <= 0) continue;
    const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
    if (Number.isNaN(dow)) continue;
    buckets[dow] += d.count;
    total += d.count;
    if (dow === 0 || dow === 6) weekend += d.count;
  }
  const fd = argmax(buckets);
  return {
    favWeekday: buckets[fd] > 0 ? fd : null,
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

  // Peak hour: only the events feed carries timestamps.
  const peakHour = peakHourFromEvents(events);
  if (peakHour != null) {
    const chrono = chronotype(peakHour);
    traits.push({
      icon: chrono.emoji,
      label: chrono.label,
      value: `Peak ${pad2(peakHour)}:00 to ${pad2((peakHour + 1) % 24)}:00 UTC`,
    });
  }

  // Weekday rhythm: from the full calendar, not the tiny events sample.
  const { favWeekday, weekendShare } = weekdayProfileFromCalendar(
    calendar.days,
  );
  if (favWeekday != null) {
    traits.push({
      icon: "📆",
      label: "Favorite day",
      value: WEEKDAY_NAMES[favWeekday],
    });
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
