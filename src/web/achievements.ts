import { Report } from "../core/index.js";

export interface Badge {
  icon: string;
  label: string;
  desc: string;
  earned: boolean;
}

export interface Gamification {
  score: number;
  level: number;
  title: string;
  prevLevelAt: number;
  nextLevelAt: number;
  pctToNext: number;
  badges: Badge[];
}

const LEVEL_TITLES = [
  "Lurker",
  "Rookie",
  "Contributor",
  "Regular",
  "Maintainer",
  "Power User",
  "Core Dev",
  "Legend",
];

function titleFor(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)];
}

/**
 * Turn the recent activity window into a playful "activity score", a level
 * with a progress bar, and a set of unlockable achievement badges. Purely
 * presentational and derived from the existing Report (no extra requests).
 */
export function deriveGamification(report: Report): Gamification {
  const { byType, events, languages, calendar } = report;

  // Weighted score: shipping and reviewing are worth more than raw commits.
  const score =
    byType.commit * 1 +
    byType.pullRequest * 4 +
    byType.issue * 2 +
    byType.review * 3 +
    byType.other * 1;

  // Cubic curve so early levels come quickly and later ones take real work.
  const level = Math.max(0, Math.floor(Math.cbrt(score)));
  const prevLevelAt = level ** 3;
  const nextLevelAt = (level + 1) ** 3;
  const span = nextLevelAt - prevLevelAt;
  const pctToNext = span > 0 ? ((score - prevLevelAt) / span) * 100 : 0;

  const totalStars = languages.reduce((s, l) => s + l.stars, 0);

  const badges: Badge[] = [
    {
      icon: "⬆️",
      label: "Committer",
      desc: "20+ commits in the recent window",
      earned: byType.commit >= 20,
    },
    {
      icon: "🚀",
      label: "Shipper",
      desc: "5+ pull requests recently",
      earned: byType.pullRequest >= 5,
    },
    {
      icon: "🛡️",
      label: "Reviewer",
      desc: "3+ reviews recently",
      earned: byType.review >= 3,
    },
    {
      icon: "🐛",
      label: "Triager",
      desc: "3+ issues recently",
      earned: byType.issue >= 3,
    },
    {
      icon: "🔥",
      label: "On Fire",
      desc: "7+ day current streak",
      earned: calendar.currentStreak >= 7,
    },
    {
      icon: "📦",
      label: "Polyglot",
      desc: "5+ languages across public repos",
      earned: languages.length >= 5,
    },
    {
      icon: "🐝",
      label: "Busy Bee",
      desc: "100+ recent public events",
      earned: events.length >= 100,
    },
    {
      icon: "🌟",
      label: "Star Magnet",
      desc: "500+ stars across public repos",
      earned: totalStars >= 500,
    },
  ];

  return {
    score,
    level,
    title: titleFor(level),
    prevLevelAt,
    nextLevelAt,
    pctToNext,
    badges,
  };
}
