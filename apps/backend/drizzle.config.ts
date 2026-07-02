import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` emits SQL from the schema; migrations are applied via
// `wrangler d1 migrations apply` (local then remote). See docs/integrations/cloudflare-setup.md.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
