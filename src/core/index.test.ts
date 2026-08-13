import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearReportCache } from "./cache.js";
import { describeYears, getReport } from "./index.js";
import { TReport } from "./types.js";

/** A fetch that answers each endpoint the report is assembled from. */
function routedFetch(
  overrides: Record<string, () => Response> = {},
): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    for (const [needle, respond] of Object.entries(overrides)) {
      if (u.includes(needle)) return respond();
    }
    if (u.includes("/users/") && u.includes("/events")) {
      return Response.json([]);
    }
    if (u.includes("/repos?")) return Response.json([]);
    if (u.includes("api.github.com/users/")) {
      return Response.json({
        login: "someone",
        name: "Some One",
        avatar_url: "",
        html_url: "",
        followers: 1,
        following: 1,
        public_repos: 1,
        created_at: "2025-01-01T00:00:00Z",
      });
    }
    // The contributions proxy: one active day, whatever window is asked for.
    return Response.json({
      total: { "2026": 3 },
      contributions: [{ date: "2026-01-02", count: 3, level: 1 }],
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  clearReportCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getReport", () => {
  it("assembles a report from the public sources", async () => {
    const report = await getReport("someone", routedFetch());
    expect(report.profile.login).toBe("someone");
    expect(report.calendar.total).toBe(3);
    expect(report.calendar.complete).toBe(true);
  });

  it("hands over an interim report before the full one", async () => {
    const seen: TReport[] = [];
    const report = await getReport("someone", routedFetch(), undefined, {
      onPartial: (r) => seen.push(r),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.profile.login).toBe("someone");
    expect(report.calendar.total).toBe(3);
  });

  it("serves the cached report until asked for a fresh one", async () => {
    const fetchImpl = vi.fn(routedFetch());

    await getReport("cacheable", fetchImpl);
    const callsAfterFirst = fetchImpl.mock.calls.length;

    await getReport("cacheable", fetchImpl);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);

    // An explicit retry has to reach past the cache, or a report degraded by
    // a passing upstream failure would just be handed back unchanged.
    await getReport("cacheable", fetchImpl, undefined, { refresh: true });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("rejects a username that cannot be a GitHub login", async () => {
    await expect(getReport("not a name", routedFetch())).rejects.toThrow(
      /not a valid GitHub username/,
    );
  });

  it("leaves no rejection unhandled when GitHub turns everything away", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    // Rate limiting rejects every GitHub call at once. getReport surfaces the
    // first and abandons the rest mid-flight, which used to leave their
    // rejections dangling — reported as unhandled errors in the console.
    const rateLimited = () =>
      new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      });
    const fetchImpl = routedFetch({
      "api.github.com": rateLimited,
    });

    await expect(getReport("someone", fetchImpl)).rejects.toThrow(/rate limit/);
    // Give any stray rejection a turn of the loop to be reported.
    await new Promise((r) => setTimeout(r, 50));

    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("describeYears", () => {
  it("collapses a run into a range", () => {
    expect(describeYears([2013, 2014, 2015, 2016])).toBe("2013\u20132016");
  });

  it("keeps separate runs apart", () => {
    expect(describeYears([2013, 2014, 2016, 2019, 2020])).toBe(
      "2013\u20132014, 2016 and 2019\u20132020",
    );
  });

  it("names a single year plainly", () => {
    expect(describeYears([2021])).toBe("2021");
  });

  it("sorts before grouping, so call order does not matter", () => {
    expect(describeYears([2016, 2014, 2015])).toBe("2014\u20132016");
  });
});
