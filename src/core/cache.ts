import { Report } from "./types.js";

// Two-tier report cache. The public GitHub API allows only 60 requests/hour
// per IP without a token, and each report is several requests, so re-querying
// the same user would burn the budget fast.
//
//   L1: in-memory Map  — fast, survives view switches and back/forward.
//   L2: sessionStorage — survives full page reloads within the same tab.
//
// Both share one TTL. The token value is never stored (only whether a token
// was used is encoded in the caller's key).

const TTL_MS = 30 * 60 * 1000;
const PREFIX = "devpulse-report:";

interface Entry {
  report: Report;
  expires: number;
}

// Minimal storage shape, so core stays free of the DOM lib while still using
// sessionStorage when it exists (the browser); in Node it is simply absent.
interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, Entry>();

/** sessionStorage, or null when unavailable (Node, or blocked by privacy). */
function session(): KeyValueStore | null {
  try {
    const store = (globalThis as { sessionStorage?: KeyValueStore })
      .sessionStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/** Return a cached report for the key if present and unexpired. */
export function readReport(key: string, now: number): Report | null {
  const mem = memory.get(key);
  if (mem) {
    if (mem.expires > now) return mem.report;
    memory.delete(key);
  }

  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    if (entry.expires > now) {
      memory.set(key, entry); // promote back into L1
      return entry.report;
    }
    store.removeItem(PREFIX + key);
  } catch {
    /* corrupt entry or blocked storage: treat as a miss */
  }
  return null;
}

/** Store a report under the key in both tiers. */
export function writeReport(key: string, report: Report, now: number): void {
  const entry: Entry = { report, expires: now + TTL_MS };
  memory.set(key, entry);

  const store = session();
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota exceeded or blocked: L1 still holds it */
  }
}

/** Drop all cached reports from both tiers (e.g. to force a fresh fetch). */
export function clearReportCache(): void {
  memory.clear();
  const store = session();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) store.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
