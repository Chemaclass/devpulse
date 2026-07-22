// Derives a fun "developer archetype" from a TReport.
// Pure and dependency-free so both the web app and the CLI can use it.

import { weekdayBuckets } from "./contributions.js";
import { parseUTCDate } from "./dates.js";
import {
  TActivityEvent,
  TCalendarDay,
  TContributionType,
  TReport,
} from "./types.js";

type TPersonaTrait = {
  icon: string;
  label: string;
  value: string;
};

export type TPersona = {
  emoji: string;
  title: string;
  tagline: string;
  /** css accent class, matches the glow-* helpers in styles.css */
  accent: string;
  traits: TPersonaTrait[];
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The events feed must span at least this many distinct days for its peak
// hour to be a meaningful chronotype rather than a single burst.
const MIN_DISTINCT_DAYS = 5;

function chronotype(hour: number): { emoji: string; label: string } {
  if (hour >= 0 && hour < 5) return { emoji: "🦉", label: "Night Owl" };
  if (hour >= 5 && hour < 9) return { emoji: "🐓", label: "Early Bird" };
  if (hour >= 9 && hour < 17) return { emoji: "☀️", label: "Daylight Coder" };
  if (hour >= 17 && hour < 21) return { emoji: "🌆", label: "Evening Hacker" };
  return { emoji: "🌙", label: "Late Nighter" };
}

const indexOfMax = (a: number[]) =>
  a.reduce((best, v, i) => (v > (a[best] ?? -Infinity) ? i : best), 0);

/**
 * Peak hour of day from the detailed events feed. This is the only source
 * with timestamps, so it can be null when there are no recent events.
 */
function peakHourFromEvents(events: TActivityEvent[]): number | null {
  const hours = new Array(24).fill(0);
  for (const e of events) {
    const h = new Date(e.datetime).getUTCHours();
    if (!Number.isNaN(h)) hours[h] += Math.max(1, e.weight);
  }
  const h = indexOfMax(hours);
  return hours[h] > 0 ? h : null;
}

type TWeekdayProfile = {
  favWeekday: number | null;
  weekendShare: number;
};

/**
 * Favorite weekday and weekend share from the full contribution calendar
 * (count-weighted). Far more representative than the ~90-day events feed,
 * which can be a single day and skew the numbers.
 */
function weekdayProfileFromCalendar(days: TCalendarDay[]): TWeekdayProfile {
  const buckets = weekdayBuckets(days);
  const total = buckets.reduce((s, n) => s + n, 0);
  const weekend = (buckets[0] ?? 0) + (buckets[6] ?? 0);
  const fd = indexOfMax(buckets);
  return {
    favWeekday: (buckets[fd] ?? 0) > 0 ? fd : null,
    weekendShare: total ? weekend / total : 0,
  };
}

/** Month of the year with the most contributions, count-weighted. */
function peakMonthFromCalendar(days: TCalendarDay[]): number | null {
  const buckets = new Array(12).fill(0);
  for (const d of days) {
    if (d.count <= 0) continue;
    const m = parseUTCDate(d.date).getUTCMonth();
    if (!Number.isNaN(m)) buckets[m] += d.count;
  }
  const m = indexOfMax(buckets);
  return buckets[m] > 0 ? m : null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

type TArchetype = {
  emoji: string;
  title: string;
  tagline: string;
  accent: string;
};

// Minimum share of a contribution type that tips the archetype its way.
// Reviews are rarer, so a smaller share still signals a reviewer.
const REVIEWER_SHARE = 0.2;
const SHIPPER_SHARE = 0.35;
const PLANNER_SHARE = 0.3;
const MACHINE_SHARE = 0.6;

function pickArchetype(
  byType: Record<TContributionType, number>,
  total: number,
): TArchetype {
  if (total === 0) {
    return {
      emoji: "🌱",
      title: "The Quiet Builder",
      tagline: "Steady work, no noise in the public feed.",
      accent: "glow-green",
    };
  }
  const share = (t: TContributionType) => byType[t] / total;
  const commit = share("commit");
  const pr = share("pullRequest");
  const issue = share("issue");
  const review = share("review");

  if (review >= REVIEWER_SHARE && review >= pr && review >= issue) {
    return {
      emoji: "🛡️",
      title: "The Guardian",
      tagline: "Nothing ships without a careful read.",
      accent: "glow-cyan",
    };
  }
  if (pr >= SHIPPER_SHARE && pr >= commit) {
    return {
      emoji: "🚀",
      title: "The Shipper",
      tagline: "Branch, PR, merge, repeat.",
      accent: "glow-violet",
    };
  }
  if (issue >= PLANNER_SHARE && issue >= commit) {
    return {
      emoji: "🗺️",
      title: "The Planner",
      tagline: "Maps the work before the code lands.",
      accent: "glow-amber",
    };
  }
  if (commit >= MACHINE_SHARE) {
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

export function derivePersona(report: TReport): TPersona {
  const { events, byType, calendar } = report;
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  const arch = pickArchetype(byType, total);

  const traits: TPersonaTrait[] = [];

  // Peak hour: only the events feed carries timestamps, and it's capped at
  // ~300 recent events. If those cluster in a day or two (common for very
  // active users) the "peak" is just that burst, not a rhythm, so require the
  // events to span enough distinct days before showing a chronotype.
  const distinctDays = new Set(events.map((e) => e.date)).size;
  const peakHour =
    distinctDays >= MIN_DISTINCT_DAYS ? peakHourFromEvents(events) : null;
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
      value: WEEKDAY_NAMES[favWeekday] ?? "",
    });
    traits.push({
      icon: weekendShare >= 0.3 ? "🏖️" : "💼",
      label: weekendShare >= 0.3 ? "Weekend Warrior" : "Weekday Worker",
      value: `${Math.round(weekendShare * 100)}% of contributions on weekends`,
    });
  }

  // Peak month parallels favorite day and is not surfaced anywhere else
  // (the streak already has its own stat tile).
  const peakMonth = peakMonthFromCalendar(calendar.days);
  if (peakMonth != null) {
    traits.push({
      icon: "🗓️",
      label: "Peak month",
      value: MONTH_NAMES[peakMonth] ?? "",
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
