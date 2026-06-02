// Shared domain types used by both the web app and the Node CLI.

export type ContributionType =
  | "commit"
  | "pullRequest"
  | "issue"
  | "review"
  | "other";

export const CONTRIBUTION_TYPES: ContributionType[] = [
  "commit",
  "pullRequest",
  "issue",
  "review",
  "other",
];

/** A single day on the GitHub contribution calendar. */
export interface CalendarDay {
  date: string; // YYYY-MM-DD
  count: number;
  level: number; // 0..4 intensity, like GitHub
}

/** Public profile info. */
export interface Profile {
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
}

/** A normalized public activity event (from the GitHub events API). */
export interface ActivityEvent {
  id: string;
  date: string; // YYYY-MM-DD (UTC)
  datetime: string; // ISO timestamp
  repo: string; // owner/name
  repoUrl: string;
  type: ContributionType;
  /** Weight toward contribution counts (e.g. number of commits in a push). */
  weight: number;
  action?: string;
  title: string;
  url: string;
}

export interface RepoStats {
  repo: string;
  repoUrl: string;
  commit: number;
  pullRequest: number;
  issue: number;
  review: number;
  other: number;
  total: number;
  lastActive: string;
}

export interface DayStats {
  date: string;
  commit: number;
  pullRequest: number;
  issue: number;
  review: number;
  other: number;
  total: number;
  repos: string[];
}

/** Aggregated primary-language usage across a user's public repos. */
export interface LanguageStat {
  language: string;
  repos: number;
  stars: number;
}

/** Per-repository commit contributions over the last year (GraphQL, token). */
export interface RepoYearStat {
  repo: string;
  repoUrl: string;
  commits: number;
}

export interface CalendarSummary {
  days: CalendarDay[];
  totalByYear: Record<string, number>;
  total: number;
  currentStreak: number;
  longestStreak: number;
  bestDay: CalendarDay | null;
  activeDays: number;
  averagePerActiveDay: number;
}

export interface Report {
  profile: Profile;
  generatedAt: string;
  /** Full-history daily totals (heatmap source). */
  calendar: CalendarSummary;
  /** Detailed recent activity (~90 days, public events). */
  events: ActivityEvent[];
  byDay: DayStats[];
  byRepo: RepoStats[];
  byType: Record<ContributionType, number>;
  /** Top primary languages across the user's public repos. */
  languages: LanguageStat[];
  /**
   * Per-repo commit contributions over the last year. Only populated when the
   * user supplies a personal access token (via the GraphQL API).
   */
  yearRepos?: RepoYearStat[];
  /** The window covered by the detailed `events`. */
  window: { from: string; to: string; days: number };
  /** Non-fatal notes (e.g. rate limiting, truncated events). */
  notes: string[];
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly kind:
      | "not_found"
      | "rate_limited"
      | "network"
      | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "GitHubError";
  }
}
