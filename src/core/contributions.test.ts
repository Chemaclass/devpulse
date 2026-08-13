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

  /** The trailing-twelve-months payload, keyed the way the service keys it. */
  function lastPayload(dates: string[], count = 1) {
    return {
      total: { lastYear: dates.length * count },
      contributions: dates.map((date) => ({ date, count, level: 1 })),
    };
  }

  function ok(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
  }

  /** Route by the `y=` parameter, the way the service is actually driven. */
  function router(
    handler: (window: string, calls: number) => Response,
  ): ReturnType<typeof vi.fn> {
    let calls = 0;
    return vi.fn(async (url: string | URL | Request) => {
      calls += 1;
      return handler(String(url).match(/y=([^&]+)/)?.[1] ?? "", calls);
    });
  }

  /** Freeze "today" so the fetched year range is deterministic. */
  function freezeToday(): void {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(TODAY + "T12:00:00Z"));
  }

  it("asks for the trailing window and every year of history", async () => {
    freezeToday();
    const fetchImpl = router((window) =>
      window === "last"
        ? ok(lastPayload(["2026-03-01"]))
        : ok(yearPayload(Number(window), Number(window) === 2024 ? 3 : 1)),
    );

    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2024,
    );

    const asked = fetchImpl.mock.calls.map(
      (c: unknown[]) => String(c[0]).match(/y=([^&]+)/)?.[1],
    );
    expect(asked.sort()).toEqual(["2024", "2025", "2026", "last"]);
    expect(summary.days.map((d) => d.date)).toEqual([
      "2024-03-01",
      "2025-03-01",
      "2026-03-01",
    ]);
    expect(summary.total).toBe(5);
    // "lastYear" is dropped: only real calendar years belong on a year chart.
    expect(summary.totalByYear).toEqual({ "2024": 3, "2025": 1, "2026": 1 });
    expect(summary.complete).toBe(true);
    expect(summary.missingYears).toEqual([]);
    vi.useRealTimers();
  });

  it("hands over the trailing window before the history lands", async () => {
    freezeToday();
    let releaseHistory = (): void => {};
    const historyHeld = new Promise<void>((r) => {
      releaseHistory = r;
    });

    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const window = String(url).match(/y=([^&]+)/)?.[1] ?? "";
      if (window === "last") return ok(lastPayload(["2026-03-01"], 5));
      await historyHeld;
      return ok(yearPayload(Number(window), 5));
    });

    const seen: number[] = [];
    const pending = fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2025,
      (recent) => seen.push(recent.total),
    );

    // The interim summary is delivered while the years are still outstanding.
    await vi.waitFor(() => expect(seen).toEqual([5]));
    releaseHistory();

    const summary = await pending;
    expect(summary.total).toBe(10); // 2025 + 2026, once the history arrives
    expect(summary.complete).toBe(true);
    expect(seen).toHaveLength(1); // handed over once, not per year
    vi.useRealTimers();
  });

  it("keeps the recent window when a year cannot be scraped", async () => {
    freezeToday();
    const fetchImpl = router((window) => {
      if (window === "last") return ok(lastPayload(["2026-03-01"], 7));
      if (window === "2026") return ok(yearPayload(2026, 7));
      return new Response('{"error":"other side closed"}', { status: 500 });
    });

    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2024,
    );

    expect(summary.total).toBe(7);
    expect(summary.days.map((d) => d.date)).toEqual(["2026-03-01"]);
    expect(summary.missingYears).toEqual([2024, 2025]);
    expect(summary.complete).toBe(false);
    vi.useRealTimers();
  });

  // Exhausts the backbone's full retry budget (~7s of backoff) on purpose.
  it("fails only when the trailing window itself cannot be fetched", async () => {
    freezeToday();
    const fetchImpl = router(
      () => new Response('{"error":"other side closed"}', { status: 500 }),
    ) as unknown as typeof fetch;

    await expect(fetchCalendar("chemaclass", fetchImpl, 2026)).rejects.toThrow(
      /Contributions service error \(500\)/,
    );
    vi.useRealTimers();
  }, 15_000);

  it("retries a window the service answers with a 5xx", async () => {
    freezeToday();
    const fetchImpl = router((window, calls) => {
      if (calls === 1) return new Response("nope", { status: 500 });
      return window === "last"
        ? ok(lastPayload(["2026-03-01"], 4))
        : ok(yearPayload(2026, 4));
    });

    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2026,
    );

    expect(summary.total).toBe(4);
    expect(summary.complete).toBe(true);
    vi.useRealTimers();
  });

  it("waits out a 429 for as long as the window says", async () => {
    freezeToday();
    const fetchImpl = router((window, calls) => {
      if (calls === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { ratelimit: '"10-in-10sec"; r=0; t=1' },
        });
      }
      return window === "last"
        ? ok(lastPayload(["2026-03-01"], 2))
        : ok(yearPayload(2026, 2));
    });

    const started = Date.now();
    const summary = await fetchCalendar(
      "chemaclass",
      fetchImpl as unknown as typeof fetch,
      2026,
    );

    expect(summary.total).toBe(2);
    // The 1s window, not the sub-second backoff a plain 5xx would have used.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    vi.useRealTimers();
  });

  it("leaves nothing unhandled when the year bound never arrives", async () => {
    freezeToday();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    // The caller's profile lookup fails, so the year bound rejects while the
    // trailing window — started before it, deliberately — is still in flight.
    const fetchImpl = router(
      () => new Response("bad request", { status: 400 }),
    ) as unknown as typeof fetch;
    const sinceYear = Promise.reject(new Error("no profile"));

    await expect(
      fetchCalendar("chemaclass", fetchImpl, sinceYear),
    ).rejects.toThrow(/no profile/);
    await new Promise((r) => setTimeout(r, 50));

    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reports an unknown user without retrying", async () => {
    freezeToday();
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));

    await expect(
      fetchCalendar("nobody", fetchImpl as unknown as typeof fetch, 2026),
    ).rejects.toThrow(GitHubError);

    // A 404 is final: each window is asked once and never asked again.
    const asked = fetchImpl.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(asked).toHaveLength(new Set(asked).size);
    vi.useRealTimers();
  });
});

describe("summarizeCalendar", () => {
  it("has no best day when nothing was ever contributed", () => {
    // A year of empty squares: naming a "best" one would put a date against
    // no activity at all.
    const s = summarizeCalendar(days("2026-01-01", Array(60).fill(0)), {});
    expect(s.bestDay).toBeNull();
    expect(s.total).toBe(0);
    expect(s.activeDays).toBe(0);
    expect(s.averagePerActiveDay).toBe(0);
  });

  it("keeps the earliest day when two tie for the best", () => {
    const s = summarizeCalendar(days("2026-01-01", [4, 1, 4]), {});
    expect(s.bestDay?.date).toBe("2026-01-01");
  });

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
