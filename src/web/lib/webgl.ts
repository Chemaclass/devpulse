/**
 * Whether this browser can give three.js a WebGL context.
 *
 * Checked before offering the 3D view rather than after it throws: the failure
 * happens during render, so the alternative is drawing a canvas, tearing it
 * back down, and logging a stack trace on every machine without a GPU.
 *
 * The probe context is released immediately — browsers cap how many can exist
 * at once, and a leaked one costs the real canvas its slot.
 */
let supported: boolean | undefined;

export function supportsWebGL(): boolean {
  if (supported !== undefined) return supported;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    supported = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    supported = false;
  }
  return supported;
}
