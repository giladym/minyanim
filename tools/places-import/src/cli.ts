/**
 * places-import (010 US3) — dev-only staged importer. Runs locally; nothing is written to the DB by
 * this script — the final stage emits SQL you review and apply with `wrangler`.
 *
 *   node tools/places-import/src/cli.ts --bbox "<south,west,north,east>" [--out <dir>] [--dry-run]
 *
 * Stages (each writes a reviewable artifact into <dir>, default ./places-out):
 *   raw.json      fetched Overpass elements
 *   mapped.json   → place records (named + located + classified)
 *   accepted.json / rejected.json   quality gates (dedupe by source id + proximity)
 *   upsert.sql    idempotent layer + place upsert (skipped with --dry-run)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetchOverpass, parseBbox } from "./overpass.ts";
import { mapElements } from "./map.ts";
import { gate } from "./gate.ts";
import { toUpsertSql } from "./sql.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const bboxStr = arg("--bbox");
  if (!bboxStr) {
    console.error('usage: node tools/places-import/src/cli.ts --bbox "south,west,north,east" [--out <dir>] [--dry-run]');
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const outDir = resolve(arg("--out") ?? "./places-out");
  mkdirSync(outDir, { recursive: true });

  const bbox = parseBbox(bboxStr);
  console.log(`fetching Overpass for ${bboxStr} …`);
  const elements = await fetchOverpass(bbox);
  writeFileSync(join(outDir, "raw.json"), JSON.stringify(elements, null, 2));

  const { records, dropped } = mapElements(elements);
  writeFileSync(join(outDir, "mapped.json"), JSON.stringify(records, null, 2));

  const { accepted, rejected } = gate(records);
  writeFileSync(join(outDir, "accepted.json"), JSON.stringify(accepted, null, 2));
  writeFileSync(join(outDir, "rejected.json"), JSON.stringify(rejected, null, 2));

  const byLayer = accepted.reduce<Record<string, number>>((m, r) => ((m[r.layer] = (m[r.layer] ?? 0) + 1), m), {});
  console.log(
    `elements: ${elements.length}  mapped: ${records.length} (dropped ${dropped})  ` +
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
