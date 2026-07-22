import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile.js";

describe("StatTile", () => {
  it("renders label and sub", () => {
    render(
      <StatTile icon="🔥" value="42" label="Current streak" sub="best 10d" />,
    );
    expect(screen.getByText("Current streak")).toBeInTheDocument();
    expect(screen.getByText("best 10d")).toBeInTheDocument();
  });

  it("omits the sub line when not provided", () => {
    const { container } = render(
      <StatTile icon="📅" value="7" label="Active days" />,
    );
    expect(container.querySelector(".sub")).toBeNull();
  });
});
