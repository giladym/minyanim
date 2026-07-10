/**
 * places-import (010) — dev-only staged importer. Runs locally; nothing is written to the DB by this
 * script — the final stage emits SQL you review and apply with `wrangler`.
 *
 *   node tools/places-import/src/cli.ts --bbox "<south,west,north,east>" [--out <dir>] [--dry-run]
 *   node tools/places-import/src/cli.ts --global                          [--out <dir>] [--dry-run]
 *
 * --global fetches the whole world by tag (no bbox) — feasible because the Jewish/kosher tags are
 * globally rare. Each category is fetched separately (robust against per-query timeouts + politer to
 * the server), with retry/backoff. Use --endpoint <url> to point at a mirror (the main server
 * rate-limits rapid/global queries).
 *
 * Stages (each writes a reviewable artifact into <dir>, default ./places-out):
 *   raw.json      fetched Overpass elements (all categories, merged)
 *   mapped.json   → place records (named + located + classified)
 *   accepted.json / rejected.json   quality gates (dedupe by source id + proximity)
 *   upsert.sql    idempotent layer + place upsert (skipped with --dry-run)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_OVERPASS_URL, fetchOverpass, parseBbox, type Bbox, type OverpassElement } from "./overpass.ts";
import { CATEGORIES } from "./categories.ts";
import { mapElements } from "./map.ts";
import { gate } from "./gate.ts";
import { toUpsertSql } from "./sql.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch one category with retry + exponential-ish backoff (Overpass 504s / rate-limits are common). */
async function fetchCategory(selectors: string[], bbox: Bbox | null, endpoint: string): Promise<OverpassElement[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fetchOverpass(selectors, bbox, { endpoint });
    } catch (err) {
      lastErr = err;
      console.error(`  attempt ${attempt} failed: ${(err as Error).message}`);
      if (attempt < 5) await sleep(attempt * 5000);
    }
  }
  throw lastErr;
}

async function main() {
  const bboxStr = arg("--bbox");
  const global = process.argv.includes("--global");
  if (!bboxStr && !global) {
    console.error('usage: node cli.ts (--bbox "south,west,north,east" | --global) [--out <dir>] [--endpoint <url>] [--dry-run]');
    process.exit(1);
  }
  const bbox: Bbox | null = bboxStr ? parseBbox(bboxStr) : null;
  const endpoint = arg("--endpoint") ?? process.env.OVERPASS_URL ?? DEFAULT_OVERPASS_URL;
  const dryRun = process.argv.includes("--dry-run");
  const outDir = resolve(arg("--out") ?? "./places-out");
  mkdirSync(outDir, { recursive: true });

  console.log(`fetching ${global ? "GLOBAL (whole world)" : bboxStr} from ${endpoint} …`);
  const elements: OverpassElement[] = [];
  for (const cat of CATEGORIES) {
    console.log(`  · ${cat.key} …`);
    const els = await fetchCategory(cat.selectors, bbox, endpoint);
    console.log(`    ${cat.key}: ${els.length} elements`);
    elements.push(...els);
    await sleep(2000); // courtesy delay between category queries
  }
  writeFileSync(join(outDir, "raw.json"), JSON.stringify(elements, null, 2));

  const { records, dropped } = mapElements(elements);
  writeFileSync(join(outDir, "mapped.json"), JSON.stringify(records, null, 2));

  const { accepted, rejected } = gate(records);
  writeFileSync(join(outDir, "accepted.json"), JSON.stringify(accepted, null, 2));
  writeFileSync(join(outDir, "rejected.json"), JSON.stringify(rejected, null, 2));

  const byLayer = accepted.reduce<Record<string, number>>((m, r) => ((m[r.layer] = (m[r.layer] ?? 0) + 1), m), {});
  console.log(
    `\nelements: ${elements.length}  mapped: ${records.length} (dropped ${dropped})  ` +
      `accepted: ${accepted.length}  rejected: ${rejected.length}`,
  );
  console.log(`by layer: ${Object.entries(byLayer).map(([k, n]) => `${k}=${n}`).join("  ") || "—"}`);

  if (dryRun) {
    console.log("\n--dry-run: no SQL written. Review accepted.json / rejected.json, then re-run without --dry-run.");
    return;
  }
  writeFileSync(join(outDir, "upsert.sql"), toUpsertSql(accepted));
  console.log(`\nwrote ${join(outDir, "upsert.sql")}`);
  console.log("apply (dev):  wrangler d1 execute minyanim --local  --file=" + join(outDir, "upsert.sql"));
  console.log("apply (prod): wrangler d1 execute minyanim --remote --file=" + join(outDir, "upsert.sql") + "   (explicit authorization)");
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
