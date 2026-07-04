import { defineConfig } from "@playwright/test";

// E2E + WCAG (axe) against the real app: backend Worker (local D1) + frontend (Vite /api proxy).
// Only Chromium is installed; "mobile" is Chromium at a 375px viewport.
export default defineConfig({
  testDir: "./e2e",
  // Emulate `prefers-reduced-motion: reduce` so entrance animations (mn-fadeup, etc.) are disabled
  // during the run. Otherwise axe can scan an element mid-fade — at partial opacity its text blends
  // toward the background and trips the contrast gate on a transient frame, not the stable UI a
  // real (reduced-motion) user sees. This makes the axe scans deterministic.
  use: { baseURL: "http://localhost:5173", reducedMotion: "reduce" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: "pnpm --filter @minyanim/backend dev --port 8787 --local --var REQUIRE_EMAIL_VERIFICATION:false --var RATE_LIMIT_DISABLED:true --var GEO_MODE:mock",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @minyanim/frontend dev --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
