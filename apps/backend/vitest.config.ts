import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Apply real D1 migrations into the isolated test DB, and provide test-only env:
// verification disabled (test-auth path) + dummy secrets so it runs in CI without .dev.vars.
const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            REQUIRE_EMAIL_VERIFICATION: "false",
            // Disable rate limiting in tests: the native limiter binding is keyed by a shared
            // "anon" IP, so many sign-ins within one file would otherwise trip the 20/60s limit.
            RATE_LIMIT_DISABLED: "true",
            BETTER_AUTH_SECRET: "test-secret-not-used-in-production",
            GOOGLE_CLIENT_ID: "test",
            GOOGLE_CLIENT_SECRET: "test",
            APP_BASE_URL: "http://localhost:5173",
            MAPTILER_API_KEY: "test-geocoding-key",
            // Geocoding route returns canned results in tests (no live MapTiler calls); the
            // live/error paths are covered by service-level tests with an injected fetch.
            GEO_MODE: "mock",
          },
        },
      },
    },
  },
});
