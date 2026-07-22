import { buildReport } from "./aggregate.js";
import { readReport, writeReport } from "./cache.js";
import { fetchCalendar } from "./contributions.js";
import { fetchYearStats } from "./graphql.js";
import {
  fetchProfile,
  fetchPublicEvents,
  fetchTopLanguages,
} from "./github.js";
import { TReport } from "./types.js";

export * from "./types.js";
export { emptyTypeRecord } from "./aggregate.js";
export { todayISO, parseUTCDate } from "./dates.js";
export { derivePersona } from "./persona.js";
export type { TPersona } from "./persona.js";

/**
 * One-shot: fetch every public source for a username and assemble a TReport.
 * Works in the browser and in Node (both have global fetch on supported runtimes).
 * Successful results are cached for ~30 minutes (in memory + sessionStorage).
 */
export async function getReport(
  username: string,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<TReport> {
  const clean = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(clean)) {
    throw new Error(`"${username}" is not a valid GitHub username.`);
  }

  // Key by user + a token fingerprint, so switching/clearing/fixing a token
  // never serves a stale report. The raw token is never part of the key.
  const authToken = token?.trim() || undefined;
  const cacheKey = `${clean.toLowerCase()}|${
    authToken ? "t" + fingerprint(authToken) : "anon"
  }`;
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

  // With a token, enrich with accurate last-year stats (by type + top repos).
  // Non-fatal: any failure falls back to the public report.
  const yearStats = authToken
    ? await fetchYearStats(clean, authToken, fetchImpl).catch(() => undefined)
    : undefined;

  const notes = [...eventsResult.notes];
  if (authToken && !yearStats) {
    notes.push(
      "A token was provided but the GraphQL year stats could not be loaded. Check the token is valid and can read contributions.",
    );
  }

  const report = buildReport({
    profile,
    calendar,
    events: eventsResult.events,
    notes,
    languages,
    yearStats,
  });
  writeReport(cacheKey, report, now);
  return report;
}

/**
 * Short non-reversible fingerprint of a token, used only to discriminate the
 * cache (so different tokens don't share an entry). The raw token is never
 * stored or logged.
 */
function fingerprint(token: string): string {
  let h = 5381;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) + h + token.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
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
  const urlMatch = trimmed.match(/github\.com\/([a-zA-Z0-9-]+)/i);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, "");
}
