// Small helpers for keeping shareable state in the URL query string.

/** Reflect the current username in the URL (new history entry). */
export function syncUrl(username: string) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("u") === username) return;
  params.set("u", username);
  window.history.pushState({}, "", `?${params.toString()}`);
}

/** Add, update or remove a single query param without touching the others. */
export function setQueryParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value == null) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  window.history.replaceState({}, "", qs ? `?${qs}` : window.location.pathname);
}
