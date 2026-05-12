import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/manual/**/*.test.ts"],
    exclude: ["node_modules/**"],
    testTimeout: 120_000,
  },
});
