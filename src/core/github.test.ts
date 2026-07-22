import { describe, expect, it, vi } from "vitest";
import { fetchProfile, parseEvent, TRawEvent } from "./github.js";

function raw(type: string, payload: Record<string, unknown>): TRawEvent {
  return {
    id: "1",
    type,
    created_at: "2026-06-02T10:00:00Z",
    repo: { name: "o/r" },
    payload,
  };
}

describe("parseEvent PushEvent", () => {
  it("uses distinct_size when present", () => {
    const e = parseEvent(raw("PushEvent", { distinct_size: 3, ref: "refs/heads/main" }));
    expect(e?.type).toBe("commit");
    expect(e?.weight).toBe(3);
    expect(e?.title).toContain("3 commits");
  });

  it("counts at least one commit when the payload omits sizes", () => {
    // Regression: the events API now often returns only ref/head/before.
    const e = parseEvent(raw("PushEvent", { ref: "refs/heads/main", head: "abc" }));
    expect(e).not.toBeNull();
    expect(e?.type).toBe("commit");
    expect(e?.weight).toBe(1);
    expect(e?.title).toContain("Pushed to main");
  });
});

describe("parseEvent other types", () => {
  it("counts opened pull requests", () => {
    const e = parseEvent(
      raw("PullRequestEvent", { action: "opened", pull_request: { title: "Feat" } }),
    );
    expect(e?.type).toBe("pullRequest");
    expect(e?.weight).toBe(1);
  });

  it("does not count a closed pull request", () => {
    const e = parseEvent(
      raw("PullRequestEvent", { action: "closed", pull_request: { title: "Feat" } }),
    );
    expect(e?.weight).toBe(0);
  });

  it("returns null for unknown event types", () => {
    expect(parseEvent(raw("MemberEvent", {}))).toBeNull();
  });
});

describe("ghFetch conditional caching (ETag)", () => {
  const userBody = JSON.stringify({
    login: "octocat",
    avatar_url: "a",
    html_url: "h",
    followers: 1,
    following: 2,
    public_repos: 3,
    created_at: "2020-01-01T00:00:00Z",
  });

  it("sends If-None-Match after a first hit and reuses the body on 304", async () => {
    const sentHeaders: Array<Record<string, string>> = [];
    const mockFetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        sentHeaders.push(headers);
        if (headers["If-None-Match"] === '"v1"') {
          return new Response(null, { status: 304 });
        }
        return new Response(userBody, {
          status: 200,
          headers: { etag: '"v1"', "Content-Type": "application/json" },
        });
      },
    );
    const fetchImpl = mockFetch as unknown as typeof fetch;

    const first = await fetchProfile("octocat", fetchImpl);
    const second = await fetchProfile("octocat", fetchImpl);

    expect(first.login).toBe("octocat");
    expect(second).toEqual(first);
    expect(sentHeaders[0]["If-None-Match"]).toBeUndefined();
    expect(sentHeaders[1]["If-None-Match"]).toBe('"v1"');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
