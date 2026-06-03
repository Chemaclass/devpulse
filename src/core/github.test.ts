import { describe, expect, it } from "vitest";
import { parseEvent, RawEvent } from "./github.js";

function raw(type: string, payload: Record<string, unknown>): RawEvent {
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
