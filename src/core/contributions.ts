import { parseUTCDate, todayISO } from "./dates.js";
import { TCalendarDay, TCalendarSummary, GitHubError } from "./types.js";

// Public, CORS-enabled proxy that exposes the GitHub contribution calendar
// as JSON for any username, without authentication.
// See: https://github.com/grubersjoe/github-contributions-api
const CALENDAR_API = "https://github-contributions-api.jogruber.de/v4";

/** GitHub launched in 2008, so no account's calendar starts before it. */
const FIRST_GITHUB_YEAR = 2008;

// The upstream scrapes github.com for anything it has not cached yet, and that
// scrape fails often enough ({"error":"other side closed"}, 5xx) that a retry
// is part of the normal path. A failed attempt caches nothing, so the retry is
// a fresh scrape rather than a cheap replay.
const MAX_SCRAPE_ATTEMPTS = 4;
const RETRY_BASE_MS = 700;
const MAX_RETRY_MS = 3_000;

// Uncached responses are also rate-limited (10-in-10sec, announced in a
// `ratelimit` header whose `t` counts the seconds left in the window). Cached
// ones are exempt, so rather than pace every request — which would punish the
// common case of an already-warm profile — the limit is obeyed when it is hit.
// Being throttled is a wait rather than a failure, so it gets its own budget.
const MAX_THROTTLE_WAITS = 4;
const RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_RATE_LIMIT_WAIT_MS = 15_000;

// Historical years are fetched in a batch this wide, under a shared deadline.
// Year-scoped queries are the service's weak spot — during a bad spell a cold
// year can fail every attempt for half a minute — so the history is given a
// bounded slice of time and the report is built from whatever arrives.
const MAX_PARALLEL_YEARS = 4;
const HISTORY_BUDGET_MS = 7_000;
const MAX_HISTORY_ATTEMPTS = 2;

// The trailing window is the one part that cannot be skipped, so it gets a far
// longer leash — but still a bounded one, so a service that only throttles can
// never hold a page in its loading state indefinitely.
const RECENT_BUDGET_MS = 15_000;

type TJogruberResponse = {
  total: Record<string, number>;
  contributions: Array<{ date: string; count: number; level: number }>;
};

/**
 * Fetch the contribution calendar for a user.
 *
 * The service is asked for the trailing twelve months first (`y=last`), which
 * is the one query it answers dependably, then for each year of the account's
 * history. The history is best-effort: year-scoped queries are the part of the
 * service that breaks, and a profile that renders its recent activity beats one
 * that shows an error because 2016 could not be scraped. Whatever is missing is
 * reported in `missingYears` so the numbers can be labelled for what they are.
 *
 * The `y=all` shortcut is never used: it asks for every year in one scrape and
 * answers 500 for every username.
 */
export async function fetchCalendar(
  username: string,
  fetchImpl: typeof fetch = fetch,
  sinceYear?: number,
): Promise<TCalendarSummary> {
  const currentYear = Number(todayISO().slice(0, 4));
  const firstYear = Math.min(
    Math.max(sinceYear ?? FIRST_GITHUB_YEAR, FIRST_GITHUB_YEAR),
    currentYear,
  );

  // Requests share a gate: the first 429 parks the rest until the window
  // resets, instead of each discovering the same limit for itself.
  const gate: TThrottleGate = { openAt: 0 };

  const years: number[] = [];
  for (let year = firstYear; year <= currentYear; year++) years.push(year);

  // History runs alongside the trailing window rather than after it, so a slow
  // backbone does not push the whole fetch past its budget. Each year swallows
  // its own failure, so this promise never rejects on its own.
  const deadline = Date.now() + HISTORY_BUDGET_MS;
  const historyPending = mapWithConcurrency(years, MAX_PARALLEL_YEARS, (year) =>
    fetchCalendarWindow(
      username,
      String(year),
      fetchImpl,
      gate,
      MAX_HISTORY_ATTEMPTS,
      deadline,
    ).catch(() => null),
  );

  const recent = await fetchCalendarWindow(
    username,
    "last",
    fetchImpl,
    gate,
    MAX_SCRAPE_ATTEMPTS,
    Date.now() + RECENT_BUDGET_MS,
  );
  const history = await historyPending;

  // Keyed by date so the two sources merge cleanly: a full year supersedes the
  // trailing window wherever they overlap, and the window fills the rest.
  const byDate = new Map<string, TCalendarDay>();
  for (const d of recent.contributions ?? []) byDate.set(d.date, { ...d });

  const totalByYear: Record<string, number> = {};
  const unscraped: number[] = [];
  history.forEach((page, i) => {
    const year = years[i] as number;
    if (!page) {
      unscraped.push(year);
      return;
    }
    for (const d of page.contributions ?? []) byDate.set(d.date, { ...d });
    // Only calendar years: the trailing window reports itself as "lastYear",
    // which would show up as a bogus column on a per-year chart.
    for (const [key, total] of Object.entries(page.total ?? {})) {
      if (/^\d{4}$/.test(key)) totalByYear[key] = total;
    }
  });

  const days = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // The trailing window reaches back past January, so the current year is
  // covered in full even when its own scrape failed — count it as present and
  // total it from the days rather than reporting a gap the data doesn't have.
  const today = todayISO();
  const missingYears = unscraped.filter((year) => {
    const covered =
      byDate.has(`${year}-01-01`) &&
      byDate.has(year === currentYear ? today : `${year}-12-31`);
    if (!covered) return true;
    totalByYear[String(year)] = days
      .filter((d) => d.date.startsWith(String(year)))
      .reduce((sum, d) => sum + d.count, 0);
    return false;
  });

  return summarizeCalendar(days, totalByYear, missingYears);
}

/** Shared "not before this timestamp" barrier for a batch of year requests. */
type TThrottleGate = { openAt: number };

/**
 * One window of the calendar — a calendar year, or "last" for the trailing
 * twelve months. Failed scrapes are retried with a backoff; being throttled
 * parks the whole batch until the rate-limit window reopens and does not spend
 * a scrape attempt, since nothing was actually tried. Passing a `deadline`
 * caps the total wait, giving up rather than holding the report back.
 */
async function fetchCalendarWindow(
  username: string,
  window: string,
  fetchImpl: typeof fetch,
  gate: TThrottleGate,
  maxAttempts: number,
  deadline?: number,
): Promise<TJogruberResponse> {
  const url = `${CALENDAR_API}/${encodeURIComponent(username)}?y=${window}`;
  let lastError: GitHubError | null = null;
  let backoff = RETRY_BASE_MS;
  let scrapes = 0;
  let throttles = 0;

  const expired = () => deadline !== undefined && Date.now() >= deadline;

  while (scrapes < maxAttempts && throttles <= MAX_THROTTLE_WAITS) {
    if (expired()) break;
    await waitForGate(gate);
    if (expired()) break;

    let res: Response;
    try {
      scrapes += 1;
      res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      lastError = new GitHubError(
        `Could not reach the contributions service: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        "network",
      );
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_RETRY_MS);
      continue;
    }

    if (res.status === 404) {
      throw new GitHubError(
        `No GitHub user named "${username}".`,
        404,
        "not_found",
      );
    }
    if (res.ok) return (await res.json()) as TJogruberResponse;

    lastError = new GitHubError(
      `Contributions service error (${res.status}).`,
      res.status,
      "unknown",
    );

    if (res.status === 429) {
      // Nothing was scraped, so this attempt is refunded: only the wait is
      // real, and it is taken on behalf of every year still queued.
      scrapes -= 1;
      throttles += 1;
      closeGate(gate, retryAfterMs(res));
      continue;
    }
    // Any other 4xx would answer the same way however often it is asked.
    if (res.status < 500) throw lastError;

    await sleep(backoff);
    backoff = Math.min(backoff * 2, MAX_RETRY_MS);
  }

  throw (
    lastError ??
    new GitHubError(`Contributions service error.`, undefined, "unknown")
  );
}

/** Hold every queued year back for `ms`, extending a wait already in place. */
function closeGate(gate: TThrottleGate, ms: number): void {
  gate.openAt = Math.max(gate.openAt, Date.now() + ms);
}

async function waitForGate(gate: TThrottleGate): Promise<void> {
  const wait = gate.openAt - Date.now();
  if (wait <= 0) return;
  // Spread the released requests over a beat: the window only admits a
  // handful, and a lockstep burst would throttle most of them again.
  await sleep(wait + Math.random() * 300);
}

/**
 * How long to wait before retrying a throttled request. The service announces
 * the seconds left in the current window as `t` inside its `ratelimit` header
 * (e.g. `"10-in-10sec"; r=0; t=7`); `Retry-After` is honoured too, in case that
 * ever changes. Falls back to a full window when neither is readable.
 */
function retryAfterMs(res: Response): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  const windowLeft = Number(
    res.headers.get("ratelimit")?.match(/\bt=(\d+)/)?.[1],
  );
  const seconds = [retryAfter, windowLeft].find(
    (s) => Number.isFinite(s) && s > 0,
  );
  const ms = seconds === undefined ? RATE_LIMIT_WINDOW_MS : seconds * 1000;
  // Add a beat so the retry lands after the reset, never exactly on it.
  return Math.min(ms + 250, MAX_RATE_LIMIT_WAIT_MS);
}

/** Run `fn` over `items` keeping at most `limit` calls in flight, in order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i] as T);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function summarizeCalendar(
  days: TCalendarDay[],
  totalByYear: Record<string, number>,
  missingYears: number[] = [],
): TCalendarSummary {
  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  let bestDay: TCalendarDay | null = null;
  for (const d of days) {
    if (!bestDay || d.count > bestDay.count) bestDay = d;
  }

  const { current, longest } = computeStreaks(days);

  return {
    days,
    totalByYear,
    total,
    currentStreak: current,
    longestStreak: longest,
    bestDay,
    activeDays,
    averagePerActiveDay: activeDays ? total / activeDays : 0,
    missingYears,
    complete: missingYears.length === 0,
  };
}

/**
 * Contributions bucketed by weekday (0 = Sunday … 6 = Saturday), count-weighted.
 * Empty and unparseable days are skipped. Shared by the persona derivation and
 * the "weekly rhythm" chart.
 */
export function weekdayBuckets(days: TCalendarDay[]): number[] {
  const buckets = new Array(7).fill(0);
  for (const d of days) {
    if (d.count <= 0) continue;
    const dow = parseUTCDate(d.date).getUTCDay();
    if (!Number.isNaN(dow)) buckets[dow] += d.count;
  }
  return buckets;
}

export function computeStreaks(
  days: TCalendarDay[],
  today: string = todayISO(),
): {
  current: number;
  longest: number;
} {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // Current streak: walk backwards counting consecutive active days. The API
  // pads the calendar with future days (and today may have no activity yet),
  // so skip any day on/after today that is empty — but break the moment a
  // *past* day has no contributions.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (!d) continue;
    if (d.count > 0) {
      current += 1;
    } else if (d.date >= today) {
      continue; // future padding or an empty today — not a break yet
    } else {
      break; // a past day with no activity ends the streak
    }
  }

  return { current, longest };
}
