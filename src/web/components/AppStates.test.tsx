import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing, Skeleton } from "./AppStates.js";

describe("Landing", () => {
  it("renders the feature cards", () => {
    render(<Landing />);
    expect(screen.getByText("A full year at a glance")).toBeInTheDocument();
    expect(screen.getByText("Your developer archetype")).toBeInTheDocument();
    expect(screen.getByText("Shareable, no login")).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("marks itself busy for assistive tech", () => {
    render(<Skeleton />);
    const region = screen.getByLabelText("Loading report");
    expect(region).toHaveAttribute("aria-busy", "true");
  });
});
