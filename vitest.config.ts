import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { obsidian: resolve(__dirname, "src/mocks/obsidian.ts") },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
