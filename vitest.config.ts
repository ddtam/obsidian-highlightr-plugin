import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The repo imports as `src/...`, resolved by tsconfig's baseUrl. Vitest
      // needs to be told the same thing.
      obsidian: resolve(__dirname, "src/mocks/obsidian.ts"),
      src: resolve(__dirname, "src"),
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
