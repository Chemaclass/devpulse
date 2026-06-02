import { CalendarDay, CalendarSummary, GitHubError } from "./types.js";

// Public, CORS-enabled proxy that exposes the GitHub contribution calendar
// as JSON for any username, without authentication.
// See: https://github.com/grubersjoe/github-contributions-api
const CALENDAR_API = "https://github-contributions-api.jogruber.de/v4";

interface JogruberResponse {
  total: Record<string, number>;
  contributions: Array<{ date: string; count: number; level: number }>;
}

/**
 * Fetch the full contribution calendar (all years) for a user.
 * Returns one entry per day across the user's whole history.
 */
export async function fetchCalendar(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarSummary> {
  const url = `${CALENDAR_API}/${encodeURIComponent(username)}?y=all`;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    throw new GitHubError(
      `Could not reach the contributions service: ${(err as Error).message}`,
      undefined,
      "network",
    );
  }

  if (res.status === 404) {
    throw new GitHubError(`No GitHub user named "${username}".`, 404, "not_found");
  }
  if (!res.ok) {
    throw new GitHubError(
      `Contributions service error (${res.status}).`,
      res.status,
      "unknown",
    );
  }

  const data = (await res.json()) as JogruberResponse;
  const days: CalendarDay[] = (data.contributions ?? [])
    .map((d) => ({ date: d.date, count: d.count, level: d.level }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return summarizeCalendar(days, data.total ?? {});
}

export function summarizeCalendar(
  days: CalendarDay[],
  totalByYear: Record<string, number>,
): CalendarSummary {
  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  let bestDay: CalendarDay | null = null;
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
  };
}

/** Today's date (UTC) as YYYY-MM-DD. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeStreaks(
  days: CalendarDay[],
  today: string = todayUTC(),
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
