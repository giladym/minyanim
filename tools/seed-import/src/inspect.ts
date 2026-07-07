/**
 * Seed-import STEP 1 — inspect / convert.
 *
 *   node tools/seed-import/src/inspect.ts <input.csv> [--out <dir>]
 *
 * Reads a CSV export of the source spreadsheet and writes, next to it (or into --out):
 *   - raw.json      : every row as an object keyed by header (reviewable, ordered as in the sheet)
 *   - profile.json  : structural report — per column fill rate, distinct count, samples, guessed kind
 *
 * Prints a compact human summary to stdout. Runs entirely locally; nothing is uploaded. This is the
 * step that lets us decide what a row represents before designing the seed schema (F3b/F4).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseCsvToObjects } from "./csv.ts";
import { profileSheet, type SheetProfile } from "./profile.ts";

function parseArgs(argv: string[]): { input?: string; out?: string } {
  const out: { input?: string; out?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.out = argv[++i];
    else if (!argv[i].startsWith("--") && !out.input) out.input = argv[i];
  }
  return out;
}

function summarize(profile: SheetProfile): string {
  const lines = [
    `rows: ${profile.rowCount}   columns: ${profile.columnCount}`,
    "",
    "column".padEnd(28) + "kind".padEnd(11) + "fill".padEnd(8) + "distinct",
    "-".repeat(55),
  ];
  for (const c of profile.columns) {
    lines.push(
      c.header.slice(0, 27).padEnd(28) +
        c.guessedKind.padEnd(11) +
        `${Math.round(c.fillRate * 100)}%`.padEnd(8) +
        String(c.distinct),
    );
  }
  return lines.join("\n");
}

function main() {
  const { input, out } = parseArgs(process.argv.slice(2));
  if (!input) {
    console.error("usage: node tools/seed-import/src/inspect.ts <input.csv> [--out <dir>]");
    process.exit(1);
  }
  const inputPath = resolve(input);
  const outDir = out ? resolve(out) : dirname(inputPath);
  mkdirSync(outDir, { recursive: true });

  const text = readFileSync(inputPath, "utf8");
  const { headers, rows } = parseCsvToObjects(text);
  const profile = profileSheet(headers, rows);

  writeFileSync(join(outDir, "raw.json"), JSON.stringify(rows, null, 2));
  writeFileSync(join(outDir, "profile.json"), JSON.stringify(profile, null, 2));

  console.log(summarize(profile));
  console.log(`\nwrote:\n  ${join(outDir, "raw.json")}\n  ${join(outDir, "profile.json")}`);
}

// Only run when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) main();
