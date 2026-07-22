import { readCachedResponse, writeCachedResponse } from "./httpCache.js";
import {
  TActivityEvent,
  GitHubError,
  TLanguageStat,
  TProfile,
} from "./types.js";

const API = "https://api.github.com";

// GitHub paginates list endpoints 100 items at a time (the max) and caps a
// user's public event history at ~300 events (≈ last 90 days).
const PAGE_SIZE = 100;
const MAX_PUBLIC_EVENTS = 300;

function ghHeaders(): Record<string, string> {
  // Public, unauthenticated access. We still send a UA + API version header
  // (recommended by GitHub). No token is ever used or stored.
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Build a fresh 200 Response from a cached body, so callers can `.json()` it
// exactly as they would a live one — the conditional cache stays invisible.
function jsonResponse(body: string, source?: Response): Response {
  return new Response(body, {
    status: 200,
    headers: source?.headers ?? { "Content-Type": "application/json" },
  });
}

async function ghFetch(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const cached = readCachedResponse(url);
  const headers = ghHeaders();
  if (cached) headers["If-None-Match"] = cached.etag;

  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch (err) {
    throw new GitHubError(
      `Network error reaching GitHub: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      "network",
    );
  }

  // Not modified since the stored ETag: reuse the body. A 304 does not count
  // against the REST rate limit, so this is the cheap fast-path after TTL.
  if (res.status === 304 && cached) {
    return jsonResponse(cached.body, res);
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
  // Cache the body against its ETag for the next conditional request.
  const etag = res.ok ? res.headers.get("etag") : null;
  if (etag) {
    const body = await res.text();
    writeCachedResponse(url, etag, body);
    return jsonResponse(body, res);
  }
  return res;
}

/** The subset of GitHub's REST user response that {@link fetchProfile} reads. */
type TRawUser = {
  login?: string;
  name?: string | null;
  avatar_url?: string;
  html_url?: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  followers?: number;
  following?: number;
  public_repos?: number;
  created_at?: string;
};

export async function fetchProfile(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TProfile> {
  const res = await ghFetch(
    `${API}/users/${encodeURIComponent(username)}`,
    fetchImpl,
  );
  if (res.status === 404) {
    throw new GitHubError(
      `No GitHub user named "${username}".`,
      404,
      "not_found",
    );
  }
  if (!res.ok) {
    throw new GitHubError(
      `GitHub error (${res.status}).`,
      res.status,
      "unknown",
    );
  }
  const u = (await res.json()) as TRawUser;
  return {
    login: String(u.login),
    name: u.name ?? null,
    avatarUrl: String(u.avatar_url),
    htmlUrl: String(u.html_url),
    bio: u.bio ?? null,
    company: u.company ?? null,
    location: u.location ?? null,
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
): Promise<{ events: TActivityEvent[]; notes: string[] }> {
  const notes: string[] = [];
  const raw: TRawEvent[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await ghFetch(
      `${API}/users/${encodeURIComponent(
        username,
      )}/events/public?per_page=${PAGE_SIZE}&page=${page}`,
      fetchImpl,
    );
    if (res.status === 404) {
      throw new GitHubError(
        `No GitHub user named "${username}".`,
        404,
        "not_found",
      );
    }
    if (!res.ok) break;
    const batch = (await res.json()) as TRawEvent[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    raw.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  if (raw.length >= MAX_PUBLIC_EVENTS) {
    notes.push(
      "GitHub caps public history at ~300 recent events, so the detailed breakdown may not reach a full 90 days for very active users.",
    );
  }

  const events = raw
    .map(parseEvent)
    .filter((e): e is TActivityEvent => e !== null);

  return { events, notes };
}

type TRawRepo = {
  fork: boolean;
  language: string | null;
  stargazers_count: number;
};

/**
 * Aggregate the primary language across a user's public, non-fork repos.
 * Best-effort: any failure resolves to an empty list so it never breaks the
 * core report (languages are an enhancement, not a requirement).
 */
export async function fetchTopLanguages(
  username: string,
  fetchImpl: typeof fetch = fetch,
  maxPages = 2,
): Promise<TLanguageStat[]> {
  const tally = new Map<string, { repos: number; stars: number }>();
  try {
    // Pages are bounded (maxPages) and independent, so fetch them concurrently
    // rather than serially. An over-fetched empty trailing page is harmless and
    // cheap (its 304 costs no rate-limit budget once cached).
    const batches = await Promise.all(
      Array.from({ length: maxPages }, async (_, i) => {
        const res = await ghFetch(
          `${API}/users/${encodeURIComponent(
            username,
          )}/repos?per_page=${PAGE_SIZE}&page=${i + 1}&sort=pushed&type=owner`,
          fetchImpl,
        );
        return res.ok ? ((await res.json()) as TRawRepo[]) : [];
      }),
    );
    for (const batch of batches) {
      if (!Array.isArray(batch)) continue;
      for (const r of batch) {
        if (r.fork || !r.language) continue;
        const e = tally.get(r.language) ?? { repos: 0, stars: 0 };
        e.repos += 1;
        e.stars += r.stargazers_count ?? 0;
        tally.set(r.language, e);
      }
    }
  } catch {
    return [];
  }
  return [...tally.entries()]
    .map(([language, v]) => ({ language, ...v }))
    .sort((a, b) => b.repos - a.repos || b.stars - a.stars);
}

/** A pull request / issue / release as it appears nested in an event payload. */
type TRawEventResource = {
  title?: string;
  name?: string;
  number?: number;
  html_url?: string;
  tag_name?: string;
};

/** The union of payload fields this module reads across event types. */
type TRawEventPayload = {
  action?: string;
  ref?: string;
  ref_type?: string;
  size?: number;
  distinct_size?: number;
  commits?: unknown[];
  number?: number;
  pull_request?: TRawEventResource;
  issue?: TRawEventResource;
  release?: TRawEventResource;
};

export type TRawEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: TRawEventPayload;
};

/** Normalize one raw GitHub event into a TActivityEvent (or null to skip). */
export function parseEvent(ev: TRawEvent): TActivityEvent | null {
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
      // The events API often omits size/distinct_size/commits on PushEvents
      // now, leaving only ref/head/before. A push always means at least one
      // commit, so fall back to 1 rather than dropping the event entirely.
      const counted =
        ev.payload.distinct_size ??
        ev.payload.size ??
        (Array.isArray(ev.payload.commits) ? ev.payload.commits.length : 0);
      const weight = counted > 0 ? counted : 1;
      const branch = String(ev.payload.ref ?? "").replace("refs/heads/", "");
      const title =
        counted > 0
          ? `Pushed ${counted} commit${counted === 1 ? "" : "s"}${branch ? ` to ${branch}` : ""}`
          : `Pushed to ${branch || "a branch"}`;
      return {
        ...base,
        type: "commit",
        weight,
        action: "pushed",
        title,
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
        title:
          `Commented on #${issue.number ?? ""}: ${issue.title ?? ""}`.trim(),
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
