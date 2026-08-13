import { buildReport } from "./aggregate.js";
import { PARTIAL_TTL_MS, TTL_MS, readReport, writeReport } from "./cache.js";
import { fetchCalendar } from "./contributions.js";
import { quiet } from "./promise.js";
import { fetchYearStats } from "./graphql.js";
import {
  fetchProfile,
  fetchPublicEvents,
  fetchTopLanguages,
} from "./github.js";
import { TCalendarSummary, TReport } from "./types.js";

export * from "./types.js";
export { emptyTypeRecord } from "./aggregate.js";
export { todayISO, parseUTCDate } from "./dates.js";
export { derivePersona } from "./persona.js";
export type { TPersona } from "./persona.js";

/**
 * Fetch every public source for a username and assemble a TReport.
 * Works in the browser and in Node (both have global fetch on supported runtimes).
 * Successful results are cached for ~30 minutes (in memory + sessionStorage);
 * a report missing years of history is held far more briefly.
 *
 * `onPartial` is called once, as soon as there is enough for a usable profile
 * (the trailing twelve months plus recent activity), with the years of history
 * still outstanding. Callers that render it get a profile on screen seconds
 * before the full report resolves; ignoring it simply waits for the whole thing.
 */
export type TReportOptions = {
  onPartial?: (report: TReport) => void;
  /**
   * Ignore any cached copy and fetch afresh. For an explicit retry: a report
   * degraded by a bad minute upstream is cached too, and re-asking for it
   * would otherwise hand back the same gaps it is being retried for.
   */
  refresh?: boolean;
};

export async function getReport(
  username: string,
  fetchImpl: typeof fetch = fetch,
  token?: string,
  { onPartial, refresh }: TReportOptions = {},
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
  const cached = refresh ? null : readReport(cacheKey, now);
  if (cached) return cached;

  // A token raises the rate limit and unlocks GraphQL. It is attached ONLY to
  // GitHub REST calls (api.github.com) — never to the calendar proxy.
  const ghFetch = authToken ? withAuth(fetchImpl, authToken) : fetchImpl;

  // Everything starts at once. Only the *historical* half of the calendar
  // depends on the profile (its creation date bounds the year range), and
  // fetchCalendar waits on that promise itself, so the trailing window is
  // already in flight while GitHub is still answering /users/<name>.
  const profilePromise = quiet(fetchProfile(clean, ghFetch));
  const eventsPromise = quiet(fetchPublicEvents(clean, ghFetch));
  const languagesPromise = quiet(fetchTopLanguages(clean, ghFetch));

  // Resolves as soon as the trailing twelve months are in, so an interim
  // report can be handed over while the historical years are still arriving.
  let onRecentCalendar: (recent: TCalendarSummary) => void = () => {};
  let onRecentFailed: (err: unknown) => void = () => {};
  const recentCalendar = new Promise<TCalendarSummary>((resolve, reject) => {
    onRecentCalendar = resolve;
    onRecentFailed = reject;
  });

  const calendarPromise = quiet(
    fetchCalendar(
      clean,
      fetchImpl, // third-party proxy: never tokenized
      quiet(profilePromise.then((p) => accountYear(p.createdAt))),
      onPartial ? onRecentCalendar : undefined,
    ),
  );
  // Nothing awaits recentCalendar unless onPartial was passed, and it is the
  // calendar's failure that decides its fate.
  calendarPromise.catch(onRecentFailed);
  quiet(recentCalendar);

  const profile = await profilePromise;

  if (onPartial) {
    // Languages are deliberately not awaited here: they cost an extra page of
    // repos and feed one card, so holding first paint for them would trade a
    // second of blank screen for a single list.
    const [recent, events] = await Promise.all([recentCalendar, eventsPromise]);
    onPartial(
      buildReport({
        profile,
        calendar: recent,
        events: events.events,
        // The gaps are still being filled, so naming them here would report a
        // hole that is merely pending. The caller knows it holds an interim.
        notes: [...events.notes],
      }),
    );
  }

  const [calendar, eventsResult, languages] = await Promise.all([
    calendarPromise,
    eventsPromise,
    languagesPromise,
  ]);

  // With a token, enrich with accurate last-year stats (by type + top repos).
  // Non-fatal: any failure falls back to the public report.
  const yearStats = authToken
    ? await fetchYearStats(clean, authToken, fetchImpl).catch(() => undefined)
    : undefined;

  const notes = [...eventsResult.notes];
  if (!calendar.complete) {
    notes.push(
      `The contributions service could not return ${describeYears(calendar.missingYears)} right now, so every calendar figure here — totals, streaks, active days — skips ${calendar.missingYears.length === 1 ? "that year" : "those years"}. It usually recovers within a few minutes.`,
    );
  }
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
  writeReport(
    cacheKey,
    report,
    now,
    calendar.complete ? TTL_MS : PARTIAL_TTL_MS,
  );
  return report;
}

/**
 * Name a set of years the way a person would: "2016", "2016–2019", or
 * "2016–2019 and 2021". A degraded service usually withholds a long unbroken
 * stretch, and spelling out thirteen of them one by one reads as noise.
 */
export function describeYears(years: number[]): string {
  const runs: Array<[number, number]> = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && year === last[1] + 1) last[1] = year;
    else runs.push([year, year]);
  }

  const parts = runs.map(([from, to]) =>
    from === to ? `${from}` : `${from}\u2013${to}`,
  );
  if (parts.length === 0) return "some years";
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Year the account was created, or undefined when GitHub sent no usable
 * timestamp — in which case the calendar falls back to its own lower bound.
 */
function accountYear(createdAt: string): number | undefined {
  const year = new Date(createdAt).getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
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
  const fromUrl = trimmed.match(/github\.com\/([a-zA-Z0-9-]+)/i)?.[1];
  if (fromUrl) return fromUrl;
  return trimmed.replace(/^@/, "");
}
