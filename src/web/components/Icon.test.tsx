import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon.js";

describe("Icon", () => {
  it("renders a mapped glyph as an SVG", () => {
    const { container } = render(<Icon glyph="⚡" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the literal glyph when unmapped", () => {
    const { container } = render(<Icon glyph="🦄" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("🦄");
  });
});
