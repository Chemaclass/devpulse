import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/index.js")>();
  return { ...actual, getReport: vi.fn() };
});

// Imported after the mock: getReport is the stub, GitHubError is the real class.
import { getReport, GitHubError } from "../core/index.js";
import { App } from "./App.js";
import { ThemeProvider } from "./theme.js";
import { TokenProvider } from "./token.js";

const mockGetReport = vi.mocked(getReport);

function renderApp() {
  return render(
    <ThemeProvider>
      <TokenProvider>
        <App />
      </TokenProvider>
    </ThemeProvider>,
  );
}

const searchBox = () => screen.getByPlaceholderText(/github username/i);

describe("App", () => {
  beforeEach(() => {
    // run() pushes ?u=<name> into the URL; reset it (and the mock) so the
    // deep-link effect doesn't auto-load a previous test's username on mount.
    mockGetReport.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("shows the landing state on first paint", () => {
    renderApp();
    expect(screen.getByText("Your developer archetype")).toBeInTheDocument();
  });

  it("shows the loading skeleton while a lookup is in flight", async () => {
    mockGetReport.mockReturnValueOnce(new Promise(() => {})); // never resolves
    renderApp();
    await userEvent.setup().type(searchBox(), "torvalds{Enter}");
    expect(await screen.findByLabelText("Loading report")).toBeInTheDocument();
  });

  it("surfaces a friendly error when the lookup fails", async () => {
    mockGetReport.mockRejectedValueOnce(
      new GitHubError('No GitHub user named "ghost".', 404, "not_found"),
    );
    renderApp();
    await userEvent.setup().type(searchBox(), "ghost{Enter}");
    const heading = await screen.findByText("Couldn't load that profile");
    // The underlying GitHub message is surfaced to the user in the same card.
    expect(heading.closest(".error")?.textContent).toContain(
      'No GitHub user named "ghost".',
    );
  });
});
