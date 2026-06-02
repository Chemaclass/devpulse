import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works on GitHub Pages project sites
// (https://<user>.github.io/<repo>/) regardless of the repo name,
// as well as on a custom domain or root deploy.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
