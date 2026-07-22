import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Core logic runs under Node; web component tests opt into jsdom by path.
    environment: "node",
    environmentMatchGlobs: [["src/web/**", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/core/**"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      // Floors set just below current core coverage so regressions fail but
      // the gate is stable. Network-orchestration files (index/graphql) are
      // intentionally light until fetch-fixture integration tests are added.
      thresholds: {
        lines: 55,
        statements: 55,
        branches: 60,
        functions: 75,
      },
    },
  },
});
