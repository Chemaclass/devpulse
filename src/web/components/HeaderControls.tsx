import { useState } from "react";
import { useTheme } from "../theme.js";
import { useToken } from "../token.js";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}

export function TokenControl() {
  const { token, setToken } = useToken();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(token);
  return (
    <div className="token-control">
      <button
        className="token-btn"
        onClick={() => {
          setDraft(token);
          setOpen((o) => !o);
        }}
        title={token ? "GitHub token set" : "Add a GitHub token (optional)"}
        aria-label="GitHub token settings"
      >
        {token ? "🔓" : "🔑"}
      </button>
      {open && (
        <div className="token-panel">
          <p className="tp-title">Optional GitHub token</p>
          <p className="tp-note">
            Unlocks a higher rate limit and real per-repo history from the last
            year. Kept only in this browser tab and sent only to
            api.github.com.
          </p>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ghp_…"
            spellCheck={false}
            autoCapitalize="none"
            name="devpulse-token"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
          />
          <div className="tp-actions">
            <a
              href="https://github.com/settings/tokens?type=beta"
              target="_blank"
              rel="noreferrer"
            >
              Create token →
            </a>
            <span className="spacer" />
            {token && (
              <button
                onClick={() => {
                  setToken("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
            <button
              className="primary"
              onClick={() => {
                setToken(draft.trim());
                setOpen(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ShareButton({ login }: { login: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${window.location.pathname}?u=${login}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked, ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      className="share-btn"
      onClick={copy}
      title="Copy a link to this report"
    >
      {copied ? "✓ Copied" : "🔗 Share"}
    </button>
  );
}
