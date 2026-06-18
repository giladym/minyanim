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
            BETTER_AUTH_SECRET: "test-secret-not-used-in-production",
            GOOGLE_CLIENT_ID: "test",
            GOOGLE_CLIENT_SECRET: "test",
            APP_BASE_URL: "http://localhost:5173",
          },
        },
      },
    },
  },
});
