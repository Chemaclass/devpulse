import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Boom(): never {
  throw new Error("Error creating WebGL context.");
}

beforeEach(() => {
  // React logs the caught error itself; keep the test output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders its children while they behave", () => {
    render(
      <ErrorBoundary fallback={<p>grid</p>}>
        <p>skyline</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("skyline")).toBeInTheDocument();
  });

  it("shows the fallback instead of unmounting when a child throws", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={<p>grid</p>} onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("grid")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();
  });
});
