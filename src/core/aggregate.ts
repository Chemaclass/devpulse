import {
  TActivityEvent,
  TCalendarSummary,
  TContributionType,
  TDayStats,
  TLanguageStat,
  TProfile,
  TReport,
  TRepoStats,
  TYearStats,
} from "./types.js";

const MS_PER_DAY = 86_400_000;

export function emptyTypeRecord(): Record<TContributionType, number> {
  return { commit: 0, pullRequest: 0, issue: 0, review: 0, other: 0 };
}

/**
 * Build the aggregated report from the three public data sources.
 */
export function buildReport(args: {
  profile: TProfile;
  calendar: TCalendarSummary;
  events: TActivityEvent[];
  notes?: string[];
  languages?: TLanguageStat[];
  yearStats?: TYearStats | undefined;
}): TReport {
  const { profile, calendar, events } = args;
  const notes = [...(args.notes ?? [])];
  const languages = args.languages ?? [];

  const byDayMap = new Map<string, TDayStats>();
  const byRepoMap = new Map<string, TRepoStats>();
  const byType = emptyTypeRecord();

  for (const ev of events) {
    if (ev.weight > 0) byType[ev.type] += ev.weight;

    // by day
    let day = byDayMap.get(ev.date);
    if (!day) {
      day = {
        date: ev.date,
        commit: 0,
        pullRequest: 0,
        issue: 0,
        review: 0,
        other: 0,
        total: 0,
        repos: [],
      };
      byDayMap.set(ev.date, day);
    }
    day[ev.type] += ev.weight;
    day.total += ev.weight;
    if (!day.repos.includes(ev.repo)) day.repos.push(ev.repo);

    // by repo
    let repo = byRepoMap.get(ev.repo);
    if (!repo) {
      repo = {
        repo: ev.repo,
        repoUrl: ev.repoUrl,
        commit: 0,
        pullRequest: 0,
        issue: 0,
        review: 0,
        other: 0,
        total: 0,
        lastActive: ev.date,
      };
      byRepoMap.set(ev.repo, repo);
    }
    repo[ev.type] += ev.weight;
    repo.total += ev.weight;
    if (ev.date > repo.lastActive) repo.lastActive = ev.date;
  }

  const byDay = [...byDayMap.values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const byRepo = [...byRepoMap.values()].sort((a, b) => b.total - a.total);

  const dates = events.map((e) => e.date).sort();
  const from = dates[0] ?? "";
  const to = dates[dates.length - 1] ?? "";
  const days =
    from && to
      ? Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY) + 1
      : 0;

  return {
    profile,
    generatedAt: new Date().toISOString(),
    calendar,
    events: [...events].sort((a, b) => b.datetime.localeCompare(a.datetime)),
    byDay,
    byRepo,
    byType,
    languages,
    ...(args.yearStats ? { yearStats: args.yearStats } : {}),
    window: { from, to, days },
    notes,
  };
}
