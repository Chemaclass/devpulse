// Per-URL conditional-request cache (ETag + last body). Separate from the
// report cache in cache.ts: that memoizes a whole assembled TReport for 30 min,
// while this lets an *expired* report be rebuilt cheaply — a request carrying
// If-None-Match that GitHub answers with 304 returns the stored body and does
// not count against the REST rate limit.
//
//   L1: in-memory Map  — survives view switches within a session.
//   L2: sessionStorage — survives a full page reload within the same tab.
//
// Entries never expire on a clock: the ETag itself is the freshness check. A
// 200 always overwrites the stored body, so nothing goes stale.

const PREFIX = "devpulse-etag:";

type TCachedResponse = {
  etag: string;
  body: string;
};

type TKeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const memory = new Map<string, TCachedResponse>();

function session(): TKeyValueStore | null {
  try {
    const store = (globalThis as { sessionStorage?: TKeyValueStore })
      .sessionStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

export function readCachedResponse(url: string): TCachedResponse | null {
  const mem = memory.get(url);
  if (mem) return mem;

  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + url);
    if (!raw) return null;
    const entry = JSON.parse(raw) as TCachedResponse;
    memory.set(url, entry); // promote back into L1
    return entry;
  } catch {
    return null;
  }
}

export function writeCachedResponse(
  url: string,
  etag: string,
  body: string,
): void {
  const entry: TCachedResponse = { etag, body };
  memory.set(url, entry);

  const store = session();
  if (!store) return;
  try {
    store.setItem(PREFIX + url, JSON.stringify(entry));
  } catch {
    /* quota exceeded or blocked: L1 still holds it */
  }
}
