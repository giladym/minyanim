import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// SPA build → dist/, served by the frontend Worker via Workers Static Assets.
// The Cloudflare Worker entry + Service Binding to the backend are added in task T022.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
