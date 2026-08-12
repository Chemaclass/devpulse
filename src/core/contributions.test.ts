import { describe, expect, it, vi } from "vitest";
import {
  computeStreaks,
  fetchCalendar,
  summarizeCalendar,
} from "./contributions.js";
import { GitHubError, TCalendarDay } from "./types.js";

/** Build consecutive days starting at `start` with the given counts. */
function days(start: string, counts: number[]): TCalendarDay[] {
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
    expect(
      computeStreaks(days("2026-01-01", Array(30).fill(0)), TODAY),
    ).toEqual({ current: 0, longest: 0 });
  });
});

describe("fetchCalendar", () => {
  /** A jogruber-shaped payload with one active day in `year`. */
  function yearPayload(year: number, count: number) {
    return {
      total: { [String(year)]: count },
      contributions: [{ date: `${year}-03-01`, count, level: 1 }],
    };
  }

  function ok(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
  }

  /** Freeze "today" so the fetched year range is deterministic. */
  function freezeToday(): void {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(TODAY + "T12:00:00Z"));
  }

  it("requests one year at a time and merges the years", async () => {
    freezeToday();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const year = Number(String(url).match(/y=(\d+)/)?.[1]);
      return ok(yearPayload(year, year === 2024 ? 3 : 1));
    });

    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2024,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3); // 2024, 2025, 2026
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("chemaclass?y=2024");
    expect(summary.days.map((d) => d.date)).toEqual([
      "2024-03-01",
      "2025-03-01",
      "2026-03-01",
    ]);
    expect(summary.total).toBe(5);
    expect(summary.totalByYear).toEqual({ "2024": 3, "2025": 1, "2026": 1 });
    vi.useRealTimers();
  });

  it("retries a year the service answers with a 5xx", async () => {
    freezeToday();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response("nope", { status: 500 });
      return ok(yearPayload(2026, 4));
    });

    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2026,
    );

    expect(calls).toBe(2);
    expect(summary.total).toBe(4);
    vi.useRealTimers();
  });

  it("waits out a 429 for as long as the window says", async () => {
    freezeToday();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { ratelimit: '"10-in-10sec"; r=0; t=1' },
        });
      }
      return ok(yearPayload(2026, 2));
    });

    const started = Date.now();
    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2026,
    );

    expect(calls).toBe(2);
    expect(summary.total).toBe(2);
    // The 1s window, not the ~0.5s backoff a plain 5xx would have used.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    vi.useRealTimers();
  });

  it("reports an unknown user without retrying", async () => {
    freezeToday();
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(fetchCalendar("nobody", fetchImpl, 2026)).rejects.toThrow(
      GitHubError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
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
