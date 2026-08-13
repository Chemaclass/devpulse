import { describe, expect, it, vi } from "vitest";
import {
  fetchProfile,
  fetchPublicEvents,
  fetchTopLanguages,
  parseEvent,
  TRawEvent,
} from "./github.js";

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
    const e = parseEvent(
      raw("PushEvent", { distinct_size: 3, ref: "refs/heads/main" }),
    );
    expect(e?.type).toBe("commit");
    expect(e?.weight).toBe(3);
    expect(e?.title).toContain("3 commits");
  });

  it("counts at least one commit when the payload omits sizes", () => {
    // Regression: the events API now often returns only ref/head/before.
    const e = parseEvent(
      raw("PushEvent", { ref: "refs/heads/main", head: "abc" }),
    );
    expect(e).not.toBeNull();
    expect(e?.type).toBe("commit");
    expect(e?.weight).toBe(1);
    expect(e?.title).toContain("Pushed to main");
  });
});

describe("parseEvent other types", () => {
  it("counts opened pull requests", () => {
    const e = parseEvent(
      raw("PullRequestEvent", {
        action: "opened",
        pull_request: { title: "Feat" },
      }),
    );
    expect(e?.type).toBe("pullRequest");
    expect(e?.weight).toBe(1);
  });

  it("does not count a closed pull request", () => {
    const e = parseEvent(
      raw("PullRequestEvent", {
        action: "closed",
        pull_request: { title: "Feat" },
      }),
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

// Every test below uses a distinct username: ghFetch keeps a per-URL ETag
// cache with no expiry, so a shared name would let one test answer another.
function jsonPage(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("ghFetch conditional caching", () => {
  it("replays the stored body when GitHub answers 304", async () => {
    const user = { login: "etagger", created_at: "2020-01-01T00:00:00Z" };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonPage(user, { etag: 'W/"abc"' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    const first = await fetchProfile("etagger", fetchImpl as typeof fetch);
    const second = await fetchProfile("etagger", fetchImpl as typeof fetch);

    expect(second).toEqual(first);
    // The second request offered the stored ETag rather than asking afresh.
    const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers["If-None-Match"]).toBe('W/"abc"');
  });

  it("reports a spent rate limit rather than the raw 403", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("forbidden", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        }),
    );

    await expect(
      fetchProfile("limited", fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("treats a 403 with budget left as an ordinary failure", async () => {
    // Blocked for some other reason (e.g. abuse detection): not a rate limit,
    // so the user should not be told to wait an hour.
    const fetchImpl = vi.fn(
      async () =>
        new Response("forbidden", {
          status: 403,
          headers: { "x-ratelimit-remaining": "42" },
        }),
    );

    await expect(
      fetchProfile("blocked", fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "unknown", status: 403 });
  });

  it("wraps a network failure with the URL it was reaching for", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      fetchProfile("offline", fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "network" });
  });
});

describe("fetchPublicEvents", () => {
  const event = (id: number): TRawEvent => ({
    id: String(id),
    type: "PushEvent",
    created_at: "2026-06-02T10:00:00Z",
    repo: { name: "o/r" },
    payload: { distinct_size: 1, ref: "refs/heads/main" },
  });

  it("stops paging as soon as a short page comes back", async () => {
    const fetchImpl = vi.fn(async () => jsonPage([event(1), event(2)]));

    const { events, notes } = await fetchPublicEvents(
      "shortpage",
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(2);
    expect(notes).toEqual([]);
  });

  it("notes the ~300 event cap once GitHub stops giving more", async () => {
    const full = Array.from({ length: 100 }, (_, i) => event(i));
    const fetchImpl = vi.fn(async () => jsonPage(full));

    const { events, notes } = await fetchPublicEvents(
      "prolific",
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3); // maxPages
    expect(events).toHaveLength(300);
    expect(notes[0]).toMatch(/caps public history/);
  });

  it("reports an unknown user", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));

    await expect(
      fetchPublicEvents("ghost-events", fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("fetchTopLanguages", () => {
  it("tallies non-fork repos, most repos first", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonPage([
        { fork: false, language: "PHP", stargazers_count: 10 },
        { fork: false, language: "PHP", stargazers_count: 5 },
        { fork: false, language: "Go", stargazers_count: 99 },
        { fork: true, language: "Rust", stargazers_count: 1000 }, // a fork
        { fork: false, language: null, stargazers_count: 3 }, // no language
      ]),
    );

    const langs = await fetchTopLanguages(
      "polyglot",
      fetchImpl as unknown as typeof fetch,
      1,
    );

    expect(langs).toEqual([
      { language: "PHP", repos: 2, stars: 15 },
      { language: "Go", repos: 1, stars: 99 },
    ]);
  });

  it("gives up quietly, since languages only enrich the report", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      fetchTopLanguages("nolangs", fetchImpl as unknown as typeof fetch, 1),
    ).resolves.toEqual([]);
  });
});
