import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * SC-006 / ADR 0007: `kosher-zmanim` (LGPL) is computed SERVER-SIDE ONLY. It must never enter the
 * frontend — only formatted time strings cross the boundary. Guard both the dependency manifest and
 * every source import so a future change can't silently pull the library into the browser bundle.
 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe("kosher-zmanim frontend containment (SC-006)", () => {
  it("is not a frontend dependency", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps)).not.toContain("kosher-zmanim");
  });

  it("is not imported anywhere under src/", () => {
    const srcDir = __dirname;
    expect(existsSync(srcDir)).toBe(true);
    const offenders = walk(srcDir).filter(
      (f) => !f.endsWith("zmanim-containment.test.ts") && /kosher-zmanim/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
