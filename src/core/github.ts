import { ActivityEvent, GitHubError, LanguageStat, Profile } from "./types.js";

const API = "https://api.github.com";

function ghHeaders(): Record<string, string> {
  // Public, unauthenticated access. We still send a UA + API version header
  // (recommended by GitHub). No token is ever used or stored.
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: ghHeaders() });
  } catch (err) {
    throw new GitHubError(
      `Network error reaching GitHub: ${(err as Error).message}`,
      undefined,
      "network",
    );
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || res.status === 429) {
      throw new GitHubError(
        "GitHub's public API rate limit was hit (60 requests/hour per IP without a token). Try again later.",
        res.status,
        "rate_limited",
      );
    }
  }
  return res;
}

export async function fetchProfile(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Profile> {
  const res = await ghFetch(
    `${API}/users/${encodeURIComponent(username)}`,
    fetchImpl,
  );
  if (res.status === 404) {
    throw new GitHubError(`No GitHub user named "${username}".`, 404, "not_found");
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub error (${res.status}).`, res.status, "unknown");
  }
  const u = (await res.json()) as Record<string, unknown>;
  return {
    login: String(u.login),
    name: (u.name as string) ?? null,
    avatarUrl: String(u.avatar_url),
    htmlUrl: String(u.html_url),
    bio: (u.bio as string) ?? null,
    company: (u.company as string) ?? null,
    location: (u.location as string) ?? null,
    followers: Number(u.followers ?? 0),
    following: Number(u.following ?? 0),
    publicRepos: Number(u.public_repos ?? 0),
    createdAt: String(u.created_at),
  };
}

/**
 * Fetch recent public activity events. GitHub exposes up to ~300 public
 * events per user (≈ last 90 days), paginated 100 at a time.
 */
export async function fetchPublicEvents(
  username: string,
  fetchImpl: typeof fetch = fetch,
  maxPages = 3,
): Promise<{ events: ActivityEvent[]; notes: string[] }> {
  const notes: string[] = [];
  const raw: RawEvent[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await ghFetch(
      `${API}/users/${encodeURIComponent(
        username,
      )}/events/public?per_page=100&page=${page}`,
      fetchImpl,
    );
    if (res.status === 404) {
      throw new GitHubError(`No GitHub user named "${username}".`, 404, "not_found");
    }
    if (!res.ok) break;
    const batch = (await res.json()) as RawEvent[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    raw.push(...batch);
    if (batch.length < 100) break;
  }

  if (raw.length >= 300) {
    notes.push(
      "GitHub caps public history at ~300 recent events, so the detailed breakdown may not reach a full 90 days for very active users.",
    );
  }

  const events = raw
    .map(parseEvent)
    .filter((e): e is ActivityEvent => e !== null);

  return { events, notes };
}

interface RawRepo {
  fork: boolean;
  language: string | null;
  stargazers_count: number;
}

/**
 * Aggregate the primary language across a user's public, non-fork repos.
 * Best-effort: any failure resolves to an empty list so it never breaks the
 * core report (languages are an enhancement, not a requirement).
 */
export async function fetchTopLanguages(
  username: string,
  fetchImpl: typeof fetch = fetch,
  maxPages = 2,
): Promise<LanguageStat[]> {
  const tally = new Map<string, { repos: number; stars: number }>();
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await ghFetch(
        `${API}/users/${encodeURIComponent(
          username,
        )}/repos?per_page=100&page=${page}&sort=pushed&type=owner`,
        fetchImpl,
      );
      if (!res.ok) break;
      const batch = (await res.json()) as RawRepo[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const r of batch) {
        if (r.fork || !r.language) continue;
        const e = tally.get(r.language) ?? { repos: 0, stars: 0 };
        e.repos += 1;
        e.stars += r.stargazers_count ?? 0;
        tally.set(r.language, e);
      }
      if (batch.length < 100) break;
    }
  } catch {
    return [];
  }
  return [...tally.entries()]
    .map(([language, v]) => ({ language, ...v }))
    .sort((a, b) => b.repos - a.repos || b.stars - a.stars);
}

interface RawEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, any>;
}

function parseEvent(ev: RawEvent): ActivityEvent | null {
  const date = ev.created_at.slice(0, 10);
  const repo = ev.repo?.name ?? "unknown/unknown";
  const repoUrl = `https://github.com/${repo}`;
  const base = {
    id: ev.id,
    date,
    datetime: ev.created_at,
    repo,
    repoUrl,
  };

  switch (ev.type) {
    case "PushEvent": {
      const commits = Array.isArray(ev.payload.commits)
        ? ev.payload.commits.length
        : 0;
      const weight = ev.payload.distinct_size ?? ev.payload.size ?? commits;
      if (!weight) return null;
      const branch = String(ev.payload.ref ?? "").replace("refs/heads/", "");
      return {
        ...base,
        type: "commit",
        weight,
        action: "pushed",
        title: `Pushed ${weight} commit${weight === 1 ? "" : "s"}${
          branch ? ` to ${branch}` : ""
        }`,
        url: repoUrl,
      };
    }
    case "PullRequestEvent": {
      const action = String(ev.payload.action ?? "");
      const pr = ev.payload.pull_request ?? {};
      // Count opened/reopened as a contribution; keep others in the feed too.
      const counts = action === "opened" || action === "reopened";
      return {
        ...base,
        type: "pullRequest",
        weight: counts ? 1 : 0,
        action,
        title: `PR ${action}: ${pr.title ?? `#${ev.payload.number ?? ""}`}`,
        url: pr.html_url ?? repoUrl,
      };
    }
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent": {
      const pr = ev.payload.pull_request ?? {};
      return {
        ...base,
        type: "review",
        weight: 1,
        action: ev.payload.action ?? "reviewed",
        title: `Reviewed PR: ${pr.title ?? `#${pr.number ?? ""}`}`,
        url: pr.html_url ?? repoUrl,
      };
    }
    case "IssuesEvent": {
      const action = String(ev.payload.action ?? "");
      const issue = ev.payload.issue ?? {};
      const counts = action === "opened" || action === "reopened";
      return {
        ...base,
        type: "issue",
        weight: counts ? 1 : 0,
        action,
        title: `Issue ${action}: ${issue.title ?? `#${issue.number ?? ""}`}`,
        url: issue.html_url ?? repoUrl,
      };
    }
    case "IssueCommentEvent": {
      const issue = ev.payload.issue ?? {};
      return {
        ...base,
        type: "other",
        weight: 1,
        action: "commented",
        title: `Commented on #${issue.number ?? ""}: ${issue.title ?? ""}`.trim(),
        url: issue.html_url ?? repoUrl,
      };
    }
    case "CreateEvent": {
      const refType = ev.payload.ref_type ?? "ref";
      const ref = ev.payload.ref ?? "";
      return {
        ...base,
        type: "other",
        weight: 1,
        action: "created",
        title: `Created ${refType}${ref ? ` ${ref}` : ""}`,
        url: repoUrl,
      };
    }
    case "ForkEvent":
      return {
        ...base,
        type: "other",
        weight: 1,
        action: "forked",
        title: `Forked ${repo}`,
        url: repoUrl,
      };
    case "WatchEvent":
      return {
        ...base,
        type: "other",
        weight: 0,
        action: "starred",
        title: `Starred ${repo}`,
        url: repoUrl,
      };
    case "ReleaseEvent": {
      const rel = ev.payload.release ?? {};
      return {
        ...base,
        type: "other",
        weight: 1,
        action: "released",
        title: `Released ${rel.tag_name ?? rel.name ?? ""}`.trim(),
        url: rel.html_url ?? repoUrl,
      };
    }
    default:
      return null;
  }
}
