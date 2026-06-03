import { describe, expect, it } from "vitest";
import { computeStreaks, summarizeCalendar } from "./contributions.js";
import { CalendarDay } from "./types.js";

/** Build consecutive days starting at `start` with the given counts. */
function days(start: string, counts: number[]): CalendarDay[] {
  let d = new Date(start + "T00:00:00Z");
  return counts.map((count) => {
    const date = d.toISOString().slice(0, 10);
    d = new Date(d.getTime() + 86_400_000);
    return { date, count, level: count > 0 ? 1 : 0 };
  });
}

const TODAY = "2026-06-02";

describe("computeStreaks", () => {
  it("counts a streak ending today, ignoring future padding", () => {
    // 5 active days through today, then a year of empty future days.
    const d = days("2026-05-29", [1, 1, 1, 1, 1, ...Array(200).fill(0)]);
    expect(computeStreaks(d, TODAY)).toEqual({ current: 5, longest: 5 });
  });

  it("forgives an empty today (grace) and counts the prior run", () => {
    // 05-29..06-02, today (06-02) empty.
    const d = days("2026-05-29", [0, 1, 1, 1, 0, ...Array(50).fill(0)]);
    expect(computeStreaks(d, TODAY).current).toBe(3);
  });

  it("breaks the current streak on a past empty day", () => {
    // 06-01 empty (past), 06-02 active (today).
    const d = days("2026-05-29", [1, 1, 1, 0, 1, ...Array(10).fill(0)]);
    expect(computeStreaks(d, TODAY)).toEqual({ current: 1, longest: 3 });
  });

  it("returns zero streaks for an all-empty calendar", () => {
    expect(computeStreaks(days("2026-01-01", Array(30).fill(0)), TODAY)).toEqual(
      { current: 0, longest: 0 },
    );
  });
});

describe("summarizeCalendar", () => {
  it("aggregates totals, active days, best day and averages", () => {
    const d = days("2026-05-30", [2, 0, 4, 1]); // 30,31,01,02
    const s = summarizeCalendar(d, { "2026": 7 });
    expect(s.total).toBe(7);
    expect(s.activeDays).toBe(3);
    expect(s.bestDay?.count).toBe(4);
    expect(s.averagePerActiveDay).toBeCloseTo(7 / 3);
    expect(s.totalByYear).toEqual({ "2026": 7 });
  });
});
