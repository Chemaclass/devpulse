import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Core logic is environment-agnostic; run it under Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
