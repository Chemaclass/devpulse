import { TReport, todayISO } from "../core/index.js";

type TBadge = {
  icon: string;
  label: string;
  desc: string;
  earned: boolean;
};

export type TGamification = {
  score: number;
  level: number;
  title: string;
  prevLevelAt: number;
  nextLevelAt: number;
  pctToNext: number;
  badges: TBadge[];
};

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
 * presentational and derived from the existing TReport (no extra requests).
 */
function yearsSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (Date.now() - then) / (365.25 * 24 * 3600 * 1000);
}

/** Total contributions in the last `lookback` days, from the calendar. */
function recentContributions(report: TReport, lookback = 90): number {
  const today = todayISO();
  const cutoff = new Date(Date.now() - lookback * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return report.calendar.days.reduce(
    (sum, d) => (d.date >= cutoff && d.date <= today ? sum + d.count : sum),
    0,
  );
}

export function deriveGamification(report: TReport): TGamification {
  const { byType, events, languages, calendar, byRepo, profile } = report;

  // Score from the contribution calendar (accurate for everyone), not the
  // public events feed, which is often sparse or only a single recent day.
  const score = recentContributions(report);

  // Cubic curve so early levels come quickly and later ones take real work.
  const level = Math.max(0, Math.floor(Math.cbrt(score)));
  const prevLevelAt = level ** 3;
  const nextLevelAt = (level + 1) ** 3;
  const span = nextLevelAt - prevLevelAt;
  const pctToNext = span > 0 ? ((score - prevLevelAt) / span) * 100 : 0;

  const totalStars = languages.reduce((s, l) => s + l.stars, 0);

  const badges: TBadge[] = [
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
    {
      icon: "🏆",
      label: "Centurion",
      desc: "A single day with 50+ contributions",
      earned: (calendar.bestDay?.count ?? 0) >= 50,
    },
    {
      icon: "⚡",
      label: "Prolific",
      desc: "10,000+ all-time contributions",
      earned: calendar.total >= 10000,
    },
    {
      icon: "💎",
      label: "Ironclad",
      desc: "100+ day longest streak",
      earned: calendar.longestStreak >= 100,
    },
    {
      icon: "🧭",
      label: "Explorer",
      desc: "8+ projects touched recently",
      earned: byRepo.length >= 8,
    },
    {
      icon: "🌍",
      label: "Influencer",
      desc: "1,000+ followers",
      earned: profile.followers >= 1000,
    },
    {
      icon: "🎂",
      label: "Veteran",
      desc: "10+ years on GitHub",
      earned: yearsSince(profile.createdAt) >= 10,
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
