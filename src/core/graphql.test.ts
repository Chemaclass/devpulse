import { describe, expect, it, vi } from "vitest";
import { fetchYearStats } from "./graphql.js";

function repoContribution(name: string, total: number) {
  return {
    repository: { nameWithOwner: name, url: `https://github.com/${name}` },
    contributions: { totalCount: total },
  };
}

function collection(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    totalCommitContributions: 100,
    totalPullRequestContributions: 20,
    totalIssueContributions: 5,
    totalPullRequestReviewContributions: 7,
    totalRepositoryContributions: 2,
    commitContributionsByRepository: [],
    pullRequestContributionsByRepository: [],
    issueContributionsByRepository: [],
    ...overrides,
  };
}

function graphqlOk(contributionsCollection: unknown): Response {
  return Response.json({ data: { user: { contributionsCollection } } });
}

describe("fetchYearStats", () => {
  it("sends the token and the login as a variable", async () => {
    const fetchImpl = vi.fn(async () => graphqlOk(collection()));

    await fetchYearStats("torvalds", "tok_123", fetchImpl as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.github.com/graphql");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "bearer tok_123",
    );
    expect(JSON.parse(String(init.body)).variables).toEqual({
      login: "torvalds",
    });
  });

  it("maps the contribution totals onto the report's types", async () => {
    const fetchImpl = vi.fn(async () => graphqlOk(collection()));

    const stats = await fetchYearStats(
      "torvalds",
      "tok",
      fetchImpl as typeof fetch,
    );

    expect(stats.byType).toEqual({
      commit: 100,
      pullRequest: 20,
      issue: 5,
      review: 7,
      other: 2,
    });
  });

  it("merges a repo's commits, PRs and issues into one total", async () => {
    const fetchImpl = vi.fn(async () =>
      graphqlOk(
        collection({
          commitContributionsByRepository: [
            repoContribution("o/alpha", 30),
            repoContribution("o/beta", 5),
          ],
          pullRequestContributionsByRepository: [
            repoContribution("o/alpha", 10),
          ],
          issueContributionsByRepository: [repoContribution("o/alpha", 2)],
        }),
      ),
    );

    const stats = await fetchYearStats(
      "torvalds",
      "tok",
      fetchImpl as typeof fetch,
    );

    expect(stats.topRepos).toEqual([
      { repo: "o/alpha", repoUrl: "https://github.com/o/alpha", total: 42 },
      { repo: "o/beta", repoUrl: "https://github.com/o/beta", total: 5 },
    ]);
  });

  it("says the token was rejected on a 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));

    await expect(
      fetchYearStats("torvalds", "bad", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/token was rejected/);
  });

  it("rejects a response carrying no contributions", async () => {
    // What GitHub returns for an unknown login, or a query it refused.
    const fetchImpl = vi.fn(async () =>
      Response.json({ data: { user: null } }),
    );

    await expect(
      fetchYearStats("ghost", "tok", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/No contributions data/);
  });

  it("wraps a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      fetchYearStats("torvalds", "tok", fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "network" });
  });
});
