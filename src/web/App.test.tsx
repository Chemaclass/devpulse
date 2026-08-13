import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/index.js")>();
  return { ...actual, getReport: vi.fn() };
});

// Imported after the mock: getReport is the stub, GitHubError is the real class.
import { getReport, GitHubError, TReport } from "../core/index.js";
import { buildReport } from "../core/aggregate.js";
import { summarizeCalendar } from "../core/contributions.js";
import { App } from "./App.js";
import { ThemeProvider } from "./theme.js";
import { TokenProvider } from "./token.js";

// The 3D view needs a WebGL context jsdom cannot provide, and three.js throws
// when it cannot get one. (The charts have the same problem for their own
// reasons; they are swapped out for every test in vitest.config.ts.)
vi.mock("./components/Skyline3D.js", () => ({
  Skyline3D: () => null,
}));

const mockGetReport = vi.mocked(getReport);

/** A real report, assembled the way the app assembles one. */
function reportFixture({
  total,
  complete,
}: {
  total: number;
  complete: boolean;
}): TReport {
  // Two days, so the total differs from the best-day count and each tile's
  // number is unambiguous to query.
  const calendar = summarizeCalendar(
    [
      { date: "2026-08-01", count: total - 7, level: 4 },
      { date: "2026-08-02", count: 7, level: 1 },
    ],
    { "2026": total },
    complete ? [] : [2015],
  );
  return buildReport({
    profile: {
      login: "torvalds",
      name: "Linus Torvalds",
      avatarUrl: "",
      htmlUrl: "",
      bio: null,
      company: null,
      location: null,
      followers: 1,
      following: 0,
      publicRepos: 1,
      createdAt: "2011-09-03T00:00:00Z",
    },
    calendar,
    events: [],
    notes: [],
    languages: [],
  });
}

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

  it("renders the interim report before the full one arrives", async () => {
    const interim = reportFixture({ total: 1_200, complete: false });
    const full = reportFixture({ total: 9_999, complete: true });

    let finish: (r: TReport) => void = () => {};
    mockGetReport.mockImplementationOnce(
      (_u: string, _f?: unknown, _t?: unknown, options?: unknown) => {
        (options as { onPartial: (r: TReport) => void }).onPartial(interim);
        return new Promise<TReport>((resolve) => {
          finish = resolve;
        });
      },
    );

    renderApp();
    await userEvent.setup().type(searchBox(), "torvalds{Enter}");

    // A profile is on screen while the history is still in flight, labelled as
    // provisional rather than passed off as the final figure.
    expect(
      await screen.findByText(/contributions so far/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading report")).not.toBeInTheDocument();
    // The tile counts up to its value, so allow the animation to land.
    expect(
      await screen.findByText("1,200", {}, { timeout: 3000 }),
    ).toBeVisible();

    finish(full);
    expect(
      await screen.findByText(/all-time contributions/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/contributions so far/i)).not.toBeInTheDocument();
    expect(
      await screen.findByText("9,999", {}, { timeout: 3000 }),
    ).toBeVisible();
  });

  it("offers a way out of a spent rate limit", async () => {
    mockGetReport.mockRejectedValue(
      new GitHubError("rate limited", 403, "rate_limited"),
    );
    renderApp();
    await userEvent.setup().type(searchBox(), "torvalds{Enter}");

    const card = (await screen.findByRole("alert")) as HTMLElement;
    expect(card).toHaveTextContent(/60 requests an hour/);

    // The token panel is the fix for this particular failure, so the card
    // opens it rather than leaving the reader to find the key icon. (The
    // header has its own token button, hence scoping the query to the card.)
    await userEvent
      .setup()
      .click(within(card).getByRole("button", { name: /token/i }));
    expect(screen.getByPlaceholderText("ghp_…")).toBeInTheDocument();
  });

  it("retries the username that failed, not whatever is in the box", async () => {
    mockGetReport.mockRejectedValueOnce(
      new GitHubError("boom", 500, "unknown"),
    );
    renderApp();
    const user = userEvent.setup();
    await user.type(searchBox(), "torvalds{Enter}");
    await screen.findByRole("alert");

    // The reader starts typing someone else before hitting retry.
    await user.clear(searchBox());
    await user.type(searchBox(), "someone-else");

    mockGetReport.mockResolvedValueOnce(
      reportFixture({ total: 1_200, complete: true }),
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(mockGetReport).toHaveBeenLastCalledWith(
      "torvalds",
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ refresh: true }),
    );
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
