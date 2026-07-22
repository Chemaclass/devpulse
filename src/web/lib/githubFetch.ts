// In development, route GitHub API calls through the Vite dev proxy (`/gh`) so
// an optional GITHUB_TOKEN in the dev environment can raise rate limits without
// exposing it to the browser (see the proxy in vite.config.ts). In production
// this is the identity `fetch` and calls go straight to GitHub. Only the GitHub
// API origin is rewritten; the contributions host is left untouched.
const GITHUB_API = "https://api.github.com";

export const apiFetch: typeof fetch = import.meta.env.DEV
  ? (input, init) =>
      typeof input === "string"
        ? fetch(input.replace(GITHUB_API, "/gh"), init)
        : fetch(input, init)
  : fetch;
