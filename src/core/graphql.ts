import { TContributionType, GitHubError, TYearStats } from "./types.js";

// GitHub GraphQL endpoint. The personal access token is ONLY ever sent here
// (api.github.com) — never to the public calendar proxy or anywhere else.
const GRAPHQL = "https://api.github.com/graphql";

const YEAR_STATS_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      commitContributionsByRepository(maxRepositories: 50) {
        repository { nameWithOwner url }
        contributions { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: 50) {
        repository { nameWithOwner url }
        contributions { totalCount }
      }
      issueContributionsByRepository(maxRepositories: 50) {
        repository { nameWithOwner url }
        contributions { totalCount }
      }
    }
  }
}`;

type TRepoContribution = {
  repository: { nameWithOwner: string; url: string };
  contributions: { totalCount: number };
};

type TContributionsCollection = {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalIssueContributions: number;
  totalPullRequestReviewContributions: number;
  totalRepositoryContributions: number;
  commitContributionsByRepository: TRepoContribution[];
  pullRequestContributionsByRepository: TRepoContribution[];
  issueContributionsByRepository: TRepoContribution[];
};

/**
 * Accurate last-year stats via the GraphQL API. Requires a token. Reaches far
 * beyond the ~90-day public events window: real per-type totals and per-repo
 * contributions for the whole year.
 */
export async function fetchYearStats(
  username: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TYearStats> {
  let res: Response;
  try {
    res = await fetchImpl(GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: YEAR_STATS_QUERY,
        variables: { login: username },
      }),
    });
  } catch (err) {
    throw new GitHubError(
      `Network error reaching GitHub GraphQL: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      "network",
    );
  }

  if (res.status === 401) {
    throw new GitHubError("The token was rejected by GitHub.", 401, "unknown");
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub GraphQL error (${res.status}).`, res.status);
  }

  const json = (await res.json()) as {
    data?: { user?: { contributionsCollection?: TContributionsCollection } };
  };
  const cc = json.data?.user?.contributionsCollection;
  if (!cc) throw new GitHubError("No contributions data returned.");

  const byType: Record<TContributionType, number> = {
    commit: cc.totalCommitContributions,
    pullRequest: cc.totalPullRequestContributions,
    issue: cc.totalIssueContributions,
    review: cc.totalPullRequestReviewContributions,
    other: cc.totalRepositoryContributions,
  };

  // Merge per-repo contributions across commits, PRs and issues.
  const repos = new Map<string, { url: string; total: number }>();
  const add = (list: TRepoContribution[] | undefined) => {
    for (const r of list ?? []) {
      const key = r.repository.nameWithOwner;
      const entry = repos.get(key) ?? { url: r.repository.url, total: 0 };
      entry.total += r.contributions.totalCount;
      repos.set(key, entry);
    }
  };
  add(cc.commitContributionsByRepository);
  add(cc.pullRequestContributionsByRepository);
  add(cc.issueContributionsByRepository);

  const topRepos = [...repos.entries()]
    .map(([repo, v]) => ({ repo, repoUrl: v.url, total: v.total }))
    .sort((a, b) => b.total - a.total);

  return { byType, topRepos };
}
