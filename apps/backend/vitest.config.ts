import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Apply real D1 migrations into the isolated test DB, and provide test-only env:
// verification disabled (test-auth path) + dummy secrets so it runs in CI without .dev.vars.
const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    // The vitest-pool-workers isolated-storage teardown flake is fixed at the root by a pnpm patch
    // (patches/@cloudflare__vitest-pool-workers@0.5.41.patch): its per-test snapshot walk asserted
    // every file in the D1 persist dir ends in `.sqlite`, but WAL leaves a `-shm`/`-wal` sidecar on
    // write-heavy tests → "Failed to push/pop isolated storage stack frame" (a worker-level crash the
    // per-test retry below could NOT recover). The patch makes the walk SKIP sidecars. `retry` stays
    // as a cheap net for any other transient. Drop the patch once on a vitest-4-compatible fixed pool.
    retry: 2,
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
            // 010: admin allowlist for the guard test — a user with this email is promoted to admin.
            ADMIN_EMAILS: "admin@example.com",
          },
        },
      },
    },
  },
});
