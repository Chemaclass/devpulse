import { GitHubError, RepoYearStat } from "./types.js";

// GitHub GraphQL endpoint. The personal access token is ONLY ever sent here
// (api.github.com) — never to the public calendar proxy or anywhere else.
const GRAPHQL = "https://api.github.com/graphql";

const REPO_CONTRIB_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      commitContributionsByRepository(maxRepositories: 25) {
        repository { nameWithOwner url }
        contributions { totalCount }
      }
    }
  }
}`;

interface RawRepoContribution {
  repository: { nameWithOwner: string; url: string };
  contributions: { totalCount: number };
}

/**
 * Per-repository commit contributions over the last year, via the GraphQL API.
 * Requires a token. This reaches far beyond the ~90-day public events window,
 * delivering real per-project history (the roadmap "multi-year" promise).
 */
export async function fetchYearRepoContributions(
  username: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepoYearStat[]> {
  let res: Response;
  try {
    res = await fetchImpl(GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: REPO_CONTRIB_QUERY,
        variables: { login: username },
      }),
    });
  } catch (err) {
    throw new GitHubError(
      `Network error reaching GitHub GraphQL: ${(err as Error).message}`,
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
    data?: {
      user?: {
        contributionsCollection?: {
          commitContributionsByRepository?: RawRepoContribution[];
        };
      };
    };
  };

  const raw =
    json.data?.user?.contributionsCollection?.commitContributionsByRepository ??
    [];
  return raw
    .map((r) => ({
      repo: r.repository.nameWithOwner,
      repoUrl: r.repository.url,
      commits: r.contributions.totalCount,
    }))
    .sort((a, b) => b.commits - a.commits);
}
