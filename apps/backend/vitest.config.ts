import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Runs tests inside the real workerd runtime with bindings from wrangler.jsonc
// (D1, rate-limit, secrets). See research D8/D12.
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
