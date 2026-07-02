import { describe, it, expect } from "vitest";
import { en } from "./locales/en";
import { he } from "./locales/he";

/** All dotted leaf-key paths in a nested translation object (sorted). */
function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj)
    .flatMap(([k, v]) =>
      v && typeof v === "object"
        ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    )
    .sort();
}

/**
 * i18n audit (T047/constitution): he and en must define the exact same set of keys — a missing
 * key silently renders the raw key string in the UI. This guards every feature's strings (002 +
 * 003: discovery/host/minyanDetail/commit/notifications/roles/…).
 */
describe("i18n he/en parity", () => {
  it("he and en have identical key sets", () => {
    const enKeys = keyPaths(en.translation as Record<string, unknown>);
    const heKeys = keyPaths(he.translation as Record<string, unknown>);
    const missingInHe = enKeys.filter((k) => !heKeys.includes(k));
    const missingInEn = heKeys.filter((k) => !enKeys.includes(k));
    expect({ missingInHe, missingInEn }).toEqual({ missingInHe: [], missingInEn: [] });
  });
});
