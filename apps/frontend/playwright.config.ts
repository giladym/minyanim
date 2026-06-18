import { defineConfig } from "@playwright/test";

// E2E + WCAG (axe) against the real app: backend Worker (local D1) + frontend (Vite /api proxy).
// Only Chromium is installed; "mobile" is Chromium at a 375px viewport.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: "pnpm --filter @minyanim/backend dev --port 8787 --local",
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
