import { buildReport } from "./aggregate.js";
import { readReport, writeReport } from "./cache.js";
import { fetchCalendar } from "./contributions.js";
import { fetchYearRepoContributions } from "./graphql.js";
import {
  fetchProfile,
  fetchPublicEvents,
  fetchTopLanguages,
} from "./github.js";
import { Report } from "./types.js";

export * from "./types.js";
export { buildReport } from "./aggregate.js";
export { fetchCalendar, summarizeCalendar } from "./contributions.js";
export { fetchYearRepoContributions } from "./graphql.js";
export {
  fetchProfile,
  fetchPublicEvents,
  fetchTopLanguages,
} from "./github.js";
export { derivePersona } from "./persona.js";
export type { Persona, PersonaTrait } from "./persona.js";

export { clearReportCache } from "./cache.js";

/**
 * One-shot: fetch every public source for a username and assemble a Report.
 * Works in the browser and in Node (both have global fetch on supported runtimes).
 * Successful results are cached for ~30 minutes (in memory + sessionStorage).
 */
export async function getReport(
  username: string,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<Report> {
  const clean = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(clean)) {
    throw new Error(
      `"${username}" is not a valid GitHub username.`,
    );
  }

  // Key by user + whether a token was used (authed reports carry more data).
  // The token value itself is never part of the key.
  const authToken = token?.trim() || undefined;
  const cacheKey = `${clean.toLowerCase()}|${authToken ? "auth" : "anon"}`;
  const now = Date.now();
  const cached = readReport(cacheKey, now);
  if (cached) return cached;

  // A token raises the rate limit and unlocks GraphQL. It is attached ONLY to
  // GitHub REST calls (api.github.com) — never to the calendar proxy.
  const ghFetch = authToken ? withAuth(fetchImpl, authToken) : fetchImpl;

  const [profile, calendar, eventsResult, languages] = await Promise.all([
    fetchProfile(clean, ghFetch),
    fetchCalendar(clean, fetchImpl), // third-party proxy: never tokenized
    fetchPublicEvents(clean, ghFetch),
    fetchTopLanguages(clean, ghFetch),
  ]);

  // With a token, enrich with real per-repo commit history for the last year.
  // Non-fatal: any failure falls back to the public report.
  const yearRepos = authToken
    ? await fetchYearRepoContributions(clean, authToken, fetchImpl).catch(
        () => undefined,
      )
    : undefined;

  const report = buildReport({
    profile,
    calendar,
    events: eventsResult.events,
    notes: eventsResult.notes,
    languages,
    yearRepos,
  });
  writeReport(cacheKey, report, now);
  return report;
}

/**
 * Wrap a fetch so requests carry the bearer token. Only ever applied to
 * GitHub REST calls, never to the third-party contribution-calendar proxy.
 */
function withAuth(fetchImpl: typeof fetch, token: string): typeof fetch {
  return (url, init) =>
    fetchImpl(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
    });
}

/**
 * Parse a GitHub profile URL or @handle or bare username into a username.
 */
export function parseUsername(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /github\.com\/([a-zA-Z0-9-]+)/i,
  );
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, "");
}
