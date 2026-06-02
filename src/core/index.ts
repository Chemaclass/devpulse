import { buildReport } from "./aggregate.js";
import { fetchCalendar } from "./contributions.js";
import { fetchProfile, fetchPublicEvents } from "./github.js";
import { Report } from "./types.js";

export * from "./types.js";
export { buildReport } from "./aggregate.js";
export { fetchCalendar, summarizeCalendar } from "./contributions.js";
export { fetchProfile, fetchPublicEvents } from "./github.js";

/**
 * One-shot: fetch every public source for a username and assemble a Report.
 * Works in the browser and in Node (both have global fetch on supported runtimes).
 */
export async function getReport(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Report> {
  const clean = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(clean)) {
    throw new Error(
      `"${username}" is not a valid GitHub username.`,
    );
  }

  const [profile, calendar, eventsResult] = await Promise.all([
    fetchProfile(clean, fetchImpl),
    fetchCalendar(clean, fetchImpl),
    fetchPublicEvents(clean, fetchImpl),
  ]);

  return buildReport({
    profile,
    calendar,
    events: eventsResult.events,
    notes: eventsResult.notes,
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
