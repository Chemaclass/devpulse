import { buildReport } from "./aggregate.js";
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

/**
 * One-shot: fetch every public source for a username and assemble a Report.
 * Works in the browser and in Node (both have global fetch on supported runtimes).
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

  // A token raises the rate limit and unlocks GraphQL. It is attached ONLY to
  // GitHub REST calls (api.github.com) — never to the calendar proxy below.
  const ghFetch: typeof fetch =
    token && token.trim()
      ? (url, init) =>
          fetchImpl(url, {
            ...init,
            headers: {
              ...(init?.headers as Record<string, string> | undefined),
              Authorization: `Bearer ${token.trim()}`,
            },
          })
      : fetchImpl;

  const [profile, calendar, eventsResult, languages] = await Promise.all([
    fetchProfile(clean, ghFetch),
    fetchCalendar(clean, fetchImpl), // third-party proxy: never tokenized
    fetchPublicEvents(clean, ghFetch),
    fetchTopLanguages(clean, ghFetch),
  ]);

  // With a token, enrich with real per-repo commit history for the last year.
  let yearRepos;
  if (token && token.trim()) {
    try {
      yearRepos = await fetchYearRepoContributions(clean, token.trim(), fetchImpl);
    } catch {
      /* non-fatal: fall back to the public report */
    }
  }

  return buildReport({
    profile,
    calendar,
    events: eventsResult.events,
    notes: eventsResult.notes,
    languages,
    yearRepos,
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
