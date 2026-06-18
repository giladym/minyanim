import { applyD1Migrations, env } from "cloudflare:test";

// Apply the generated D1 migrations to the isolated per-file test database before tests run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
