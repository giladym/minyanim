import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit-test config (Vitest + Testing Library). Playwright e2e lives under e2e/ and is run
// separately via `pnpm test:e2e`, so it is excluded here to keep `vitest run` unit-only.
// `react()` is cast because the workspace resolves two Vite majors (5 for the app build, 6 via
// vitest); the plugin is runtime-compatible, only the cross-version Plugin types clash.
export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
