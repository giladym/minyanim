/**
 * Seed-import STEPS 2–4 — map → gate → SQL (dry-run).
 *
 *   node tools/seed-import/src/build.ts <input.csv> --out <dir> [--existing-phones <phones.json>]
 *
 * Reads the CSV, maps the people table (ZAKOPANE_MAPPING), applies the quality + collision gates,
 * derives candidate minyanim, and writes reviewable artifacts + a single `upsert.sql`:
 *   - records.json   : raw mapped rows (Step 2)
 *   - accepted.json  : rows that passed every gate (Step 3)
 *   - rejected.json  : rows that failed, with reasons (incl. collisions)
 *   - upsert.sql     : the create statements (Step 4) — reviewed, then applied MANUALLY via wrangler.
 *
 * DRY RUN ONLY: it never touches a database. `--existing-phones` is a JSON file of the E.164 numbers
 * already owned by real users (query dev first); any seed sharing one is reported + excluded. Apply
 * with:  wrangler d1 execute minyanim --remote --file <out>/upsert.sql   (dev only).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseCsv } from "./csv.ts";
import { mapSheet, ZAKOPANE_MAPPING } from "./mapping.ts";
import { gate, deriveEvents } from "./gates.ts";
import { buildSeedSql } from "./sql.ts";

function parseArgs(argv: string[]): { input?: string; out?: string; existing?: string } {
  const a: { input?: string; out?: string; existing?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") a.out = argv[++i];
    else if (argv[i] === "--existing-phones") a.existing = argv[++i];
    else if (!argv[i].startsWith("--") && !a.input) a.input = argv[i];
  }
  return a;
}

/** Load the set of E.164 numbers already owned by real users from a wrangler `--json` SELECT dump. */
export function loadExistingPhones(path: string | undefined): Set<string> {
  if (!path) return new Set();
  const j = JSON.parse(readFileSync(resolve(path), "utf8"));
  const results = (Array.isArray(j) ? j[0]?.results : j?.results) ?? [];
  return new Set(results.map((r: { e164: string }) => r.e164).filter(Boolean));
}

function main() {
  const { input, out, existing } = parseArgs(process.argv.slice(2));
  if (!input) {
    console.error("usage: node tools/seed-import/src/build.ts <input.csv> --out <dir> [--existing-phones <phones.json>]");
    process.exit(1);
  }
  const inputPath = resolve(input);
  const outDir = out ? resolve(out) : dirname(inputPath);
  mkdirSync(outDir, { recursive: true });

  const matrix = parseCsv(readFileSync(inputPath, "utf8"));
  const records = mapSheet(matrix, ZAKOPANE_MAPPING);
  const existingPhones = loadExistingPhones(existing);
  const { accepted, rejected, collisions } = gate(records, ZAKOPANE_MAPPING, existingPhones);
  const events = deriveEvents(accepted, ZAKOPANE_MAPPING);
  const { sql, counts } = buildSeedSql(accepted, events, ZAKOPANE_MAPPING);

  writeFileSync(join(outDir, "records.json"), JSON.stringify(records, null, 2));
  writeFileSync(join(outDir, "accepted.json"), JSON.stringify(accepted, null, 2));
  writeFileSync(join(outDir, "rejected.json"), JSON.stringify(rejected, null, 2));
  writeFileSync(join(outDir, "upsert.sql"), sql);

  console.log("=== DRY RUN (no DB writes) ===");
  console.log(`mapped rows: ${records.length}  →  accepted: ${accepted.length}, rejected: ${rejected.length}`);
  console.log(`COLLISION GATE — skipped (phone already a real user): ${collisions.length}`);
  const byReason: Record<string, number> = {};
  for (const r of rejected) for (const reason of r.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1;
  if (rejected.length) console.log("rejection reasons:", byReason);
  console.log(`would create → users:${counts.users} phones:${counts.phones} stays:${counts.stays} events:${counts.events} commitments:${counts.commitments}`);
  for (const e of events.filter((x) => x.attendeeIndexes.length))
    console.log(`  minyan: ${e.city} · ${e.shabbatLabel} (${e.date}) — ${e.attendeeIndexes.length} people`);
  console.log(`\nwrote: ${["records.json", "accepted.json", "rejected.json", "upsert.sql"].map((f) => join(outDir, f)).join(", ")}`);
  console.log(`\napply (dev only): wrangler d1 execute minyanim --remote --file ${join(outDir, "upsert.sql")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
