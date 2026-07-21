// Thin wrapper around the Cronitor RUM client loaded in index.html.
// Lets us track a clean "profile viewed" event with the username as a
// property instead of relying on Cronitor parsing the ?u= query string.

type TCronitorFn = (command: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    cronitor?: TCronitorFn;
  }
}

/**
 * Record that a GitHub profile was viewed, tagged with the username.
 * `source` distinguishes the main lookup from the side-by-side compare slot.
 */
export function trackProfileView(username: string, source: "main" | "compare" = "main") {
  // The inline snippet defines a queueing stub immediately, so this is safe
  // to call before script.js has finished loading.
  window.cronitor?.("track", "profile_view", { username, source });
}
