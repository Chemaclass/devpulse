// Shared domain types used by both the web app and the Node CLI.

export type TContributionType =
  "commit" | "pullRequest" | "issue" | "review" | "other";

export const CONTRIBUTION_TYPES: TContributionType[] = [
  "commit",
  "pullRequest",
  "issue",
  "review",
  "other",
];

/** A single day on the GitHub contribution calendar. */
export type TCalendarDay = {
  date: string; // YYYY-MM-DD
  count: number;
  level: number; // 0..4 intensity, like GitHub
};

/** Public profile info. */
export type TProfile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt: string;
};

/** A normalized public activity event (from the GitHub events API). */
export type TActivityEvent = {
  id: string;
  date: string; // YYYY-MM-DD (UTC)
  datetime: string; // ISO timestamp
  repo: string; // owner/name
  repoUrl: string;
  type: TContributionType;
  /** Weight toward contribution counts (e.g. number of commits in a push). */
  weight: number;
  /** Event-type-specific action, when present (e.g. "opened", "reviewed"). */
  action?: string;
  title: string;
  url: string;
};

export type TRepoStats = {
  repo: string;
  repoUrl: string;
  commit: number;
  pullRequest: number;
  issue: number;
  review: number;
  other: number;
  total: number;
  lastActive: string;
};

export type TDayStats = {
  date: string;
  commit: number;
  pullRequest: number;
  issue: number;
  review: number;
  other: number;
  total: number;
  repos: string[];
};

/** Aggregated primary-language usage across a user's public repos. */
export type TLanguageStat = {
  language: string;
  repos: number;
  stars: number;
};

/** Per-repository contributions over the last year (GraphQL, token). */
type TRepoYearStat = {
  repo: string;
  repoUrl: string;
  total: number;
};

/**
 * Accurate last-year stats from the GraphQL contributionsCollection, available
 * only with a token. Unlike the public events feed (capped at ~300 events),
 * these cover a full year by type and per repository.
 */
export type TYearStats = {
  byType: Record<TContributionType, number>;
  topRepos: TRepoYearStat[];
};

export type TCalendarSummary = {
  days: TCalendarDay[];
  totalByYear: Record<string, number>;
  total: number;
  currentStreak: number;
  longestStreak: number;
  bestDay: TCalendarDay | null;
  activeDays: number;
  averagePerActiveDay: number;
};

export type TReport = {
  profile: TProfile;
  generatedAt: string;
  /** Full-history daily totals (heatmap source). */
  calendar: TCalendarSummary;
  /** Detailed recent activity (~90 days, public events). */
  events: TActivityEvent[];
  byDay: TDayStats[];
  byRepo: TRepoStats[];
  byType: Record<TContributionType, number>;
  /** Top primary languages across the user's public repos. */
  languages: TLanguageStat[];
  /**
   * Accurate last-year stats (by type + top repos) from GraphQL. Only
   * populated when the user supplies a personal access token.
   */
  yearStats?: TYearStats;
  /** The window covered by the detailed `events`. */
  window: { from: string; to: string; days: number };
  /** Non-fatal notes (e.g. rate limiting, truncated events). */
  notes: string[];
};

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly kind:
      "not_found" | "rate_limited" | "network" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "GitHubError";
  }
}
