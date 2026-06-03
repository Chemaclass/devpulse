import { describe, expect, it } from "vitest";
import { buildReport } from "./aggregate.js";
import { ActivityEvent, CalendarSummary, Profile } from "./types.js";

const profile = { login: "x" } as Profile;
const calendar = {
  days: [],
  totalByYear: {},
  total: 0,
  currentStreak: 0,
  longestStreak: 0,
  bestDay: null,
  activeDays: 0,
  averagePerActiveDay: 0,
} as CalendarSummary;

function ev(over: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: Math.random().toString(),
    date: "2026-06-02",
    datetime: "2026-06-02T10:00:00Z",
    repo: "o/r",
    repoUrl: "https://github.com/o/r",
    type: "commit",
    weight: 1,
    title: "",
    url: "",
    ...over,
  };
}

describe("buildReport", () => {
  it("aggregates by type, by repo and by day", () => {
    const events = [
      ev({ type: "commit", weight: 3, repo: "o/a", date: "2026-06-02" }),
      ev({ type: "pullRequest", weight: 1, repo: "o/a", date: "2026-06-02" }),
      ev({ type: "commit", weight: 2, repo: "o/b", date: "2026-06-01" }),
    ];
    const r = buildReport({ profile, calendar, events });

    expect(r.byType.commit).toBe(5);
    expect(r.byType.pullRequest).toBe(1);

    const repoA = r.byRepo.find((x) => x.repo === "o/a");
    expect(repoA?.total).toBe(4);
    expect(r.byRepo[0].repo).toBe("o/a"); // sorted by total desc

    expect(r.byDay).toHaveLength(2);
    expect(r.byDay[0].date).toBe("2026-06-02"); // newest first
    expect(r.window).toEqual({ from: "2026-06-01", to: "2026-06-02", days: 2 });
  });

  it("passes languages and yearStats through", () => {
    const r = buildReport({
      profile,
      calendar,
      events: [],
      languages: [{ language: "TypeScript", repos: 3, stars: 10 }],
      yearStats: {
        byType: { commit: 9, pullRequest: 2, issue: 1, review: 3, other: 0 },
        topRepos: [{ repo: "o/a", repoUrl: "", total: 12 }],
      },
    });
    expect(r.languages[0].language).toBe("TypeScript");
    expect(r.yearStats?.byType.commit).toBe(9);
    expect(r.yearStats?.topRepos[0].total).toBe(12);
  });
});
