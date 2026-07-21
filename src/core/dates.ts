// Small UTC date helpers shared by the core logic and the web app. The
// contribution calendar is date-only (YYYY-MM-DD); treating those days in UTC
// keeps buckets and streaks stable regardless of the viewer's timezone.

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD calendar day as UTC midnight. */
export function parseUTCDate(date: string): Date {
  return new Date(date + "T00:00:00Z");
}
