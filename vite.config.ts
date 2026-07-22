import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages project sites
// (https://<user>.github.io/<repo>/) regardless of the repo name,
// as well as on a custom domain or root deploy.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    // Emit source maps as separate files without referencing them from the
    // bundles, so production errors stay traceable without shipping the maps
    // inline or advertising them to visitors.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        // Split the two heavy, self-contained libraries into their own
        // long-lived chunks so app-code edits don't bust their cache. Only
        // three-core (which has no React dependency) is pinned — pinning the
        // React-consuming @react-three wrappers would fork a second React copy
        // and break hooks, so those stay with React's natural single chunk.
        // three-core is reached only through the lazily-imported Skyline3D, so
        // its chunk still loads on demand, never on first paint.
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "vendor-three";
          if (
            id.includes("/node_modules/chart.js/") ||
            id.includes("/node_modules/react-chartjs-2/")
          ) {
            return "vendor-charts";
          }
        },
      },
    },
    // The three.js chunk is inherently large and lazy-loaded (never on first
    // paint), so raise the warning bar above it rather than muting it globally.
    chunkSizeWarningLimit: 1000,
  },
});
