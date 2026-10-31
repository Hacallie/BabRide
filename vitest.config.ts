import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Components are compiled with the automatic JSX runtime (tsconfig keeps "preserve" for Next).
  esbuild: { jsx: "automatic" },
  // UI tests opt into jsdom with a "// @vitest-environment jsdom" comment; everything else stays in node.
  test: { include: ["tests/**/*.test.{ts,tsx}"] },
});
