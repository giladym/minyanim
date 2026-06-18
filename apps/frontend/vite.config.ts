import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// SPA build → dist/, served in production by the frontend Worker (src/worker.ts) via Workers
// Static Assets, which proxies /api to the backend through a Service Binding (ADR-0005).
// In dev, Vite proxies /api to the locally-running backend Worker (wrangler dev on :8787).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
