import { describe, expect, it } from "vitest";
import { derivePersona } from "./persona.js";
import {
  ActivityEvent,
  CalendarDay,
  ContributionType,
  Report,
} from "./types.js";

function ev(datetime: string, type: ContributionType): ActivityEvent {
  return {
    id: datetime + type,
    date: datetime.slice(0, 10),
    datetime,
    repo: "o/r",
    repoUrl: "",
    type,
    weight: 1,
    title: "",
    url: "",
  };
}

function report(over: {
  byType?: Partial<Record<ContributionType, number>>;
  events?: ActivityEvent[];
  days?: CalendarDay[];
}): Report {
  const byType = {
    commit: 0,
    pullRequest: 0,
    issue: 0,
    review: 0,
    other: 0,
    ...over.byType,
  };
  return {
    profile: { login: "x" } as Report["profile"],
    generatedAt: "",
    calendar: {
      days: over.days ?? [],
      totalByYear: {},
      total: 0,
      currentStreak: 0,
      longestStreak: 0,
      bestDay: null,
      activeDays: 0,
      averagePerActiveDay: 0,
    },
    events: over.events ?? [],
    byDay: [],
    byRepo: [],
    byType,
    languages: [],
    window: { from: "", to: "", days: 0 },
    notes: [],
  };
}

describe("derivePersona archetype", () => {
  it("is The Shipper when pull requests dominate", () => {
    expect(derivePersona(report({ byType: { pullRequest: 10, commit: 2 } })).title).toBe(
      "The Shipper",
    );
  });

  it("is The Machine when commits dominate", () => {
    expect(derivePersona(report({ byType: { commit: 20 } })).title).toBe(
      "The Machine",
    );
  });

  it("is The Guardian when reviews are a strong share", () => {
    expect(derivePersona(report({ byType: { review: 5, commit: 5 } })).title).toBe(
      "The Guardian",
    );
  });

  it("is The Planner when issues dominate", () => {
    expect(derivePersona(report({ byType: { issue: 6, commit: 2 } })).title).toBe(
      "The Planner",
    );
  });

  it("is The Quiet Builder with no recent activity", () => {
    expect(derivePersona(report({})).title).toBe("The Quiet Builder");
  });
});

describe("derivePersona traits", () => {
  const days: CalendarDay[] = [
    { date: "2026-06-06", count: 10, level: 4 }, // Saturday
    { date: "2026-06-13", count: 10, level: 4 }, // Saturday
  ];

  it("derives weekend share and favorite day from the calendar", () => {
    const traits = derivePersona(report({ byType: { commit: 1 }, days })).traits;
    const fav = traits.find((t) => t.label === "Favorite day");
    const weekend = traits.find((t) => t.label.includes("Weekend"));
    expect(fav?.value).toBe("Saturday");
    expect(weekend?.value).toBe("100% of contributions on weekends");
  });

  it("derives peak month from the calendar", () => {
    const peak = derivePersona(report({ byType: { commit: 1 }, days })).traits.find(
      (t) => t.label === "Peak month",
    );
    expect(peak?.value).toBe("June");
  });

  it("derives the peak hour and chronotype from events spanning enough days", () => {
    // Needs >= 5 distinct days, all peaking at 02:00 UTC.
    const events = [
      ev("2026-06-01T02:30:00Z", "commit"),
      ev("2026-06-02T02:30:00Z", "commit"),
      ev("2026-06-03T02:30:00Z", "commit"),
      ev("2026-06-04T02:30:00Z", "commit"),
      ev("2026-06-05T02:30:00Z", "commit"),
    ];
    const chrono = derivePersona(report({ byType: { commit: 1 }, events })).traits[0];
    expect(chrono.label).toBe("Night Owl");
    expect(chrono.value).toBe("Peak 02:00 to 03:00 UTC");
  });

  it("omits the chronotype when events span too few days", () => {
    const events = [ev("2026-06-02T02:30:00Z", "commit")];
    const traits = derivePersona(report({ byType: { commit: 1 }, events })).traits;
    expect(traits.some((t) => t.label === "Night Owl")).toBe(false);
  });
});
