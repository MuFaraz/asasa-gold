import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // One file at a time: each file boots its own in-memory Postgres (WASM), which is memory hungry.
  test: { environment: "node", include: ["tests/**/*.test.ts"], fileParallelism: false },
});
