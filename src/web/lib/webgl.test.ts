import { afterEach, describe, expect, it, vi } from "vitest";
import { supportsWebGL } from "./webgl.js";

// The module memoizes its answer, so each case needs a fresh copy of it.
async function freshProbe(): Promise<typeof supportsWebGL> {
  vi.resetModules();
  return (await import("./webgl.js")).supportsWebGL;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("supportsWebGL", () => {
  it("says no when the browser hands back no context", async () => {
    // jsdom's canvas has no WebGL implementation, which is the case in point.
    const probe = await freshProbe();
    expect(probe()).toBe(false);
  });

  it("says yes when a context comes back, and releases it", async () => {
    const loseContext = vi.fn();
    const gl = {
      getExtension: vi.fn(() => ({ loseContext })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      gl as unknown as RenderingContext,
    );

    const probe = await freshProbe();
    expect(probe()).toBe(true);
    // A probe that keeps its context costs the real canvas one of the few
    // the browser allows.
    expect(loseContext).toHaveBeenCalled();
  });

  it("only asks the browser once", async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);

    const probe = await freshProbe();
    probe();
    probe();
    probe();

    // Two calls for the single probe: webgl2, then webgl as the fallback.
    expect(getContext).toHaveBeenCalledTimes(2);
  });

  it("says no when creating a canvas throws", async () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("blocked");
    });

    const probe = await freshProbe();
    expect(probe()).toBe(false);
  });
});
