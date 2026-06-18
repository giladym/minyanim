// Prerender the marketing homepage to static HTML for SEO (T028).
// Serves the built SPA, renders "/" in Chromium, and writes the rendered DOM back to
// dist/index.html. React still mounts on load (the snapshot is for crawlers + first paint).
import { chromium } from "@playwright/test";
import { preview } from "vite";
import { writeFileSync } from "node:fs";

const PORT = 4179;
const server = await preview({ preview: { port: PORT } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  const html = await page.content();
  writeFileSync(new URL("../dist/index.html", import.meta.url), html);
  console.log("✓ Prerendered dist/index.html");
} finally {
  await browser.close();
  await new Promise((res) => server.httpServer.close(res));
}
