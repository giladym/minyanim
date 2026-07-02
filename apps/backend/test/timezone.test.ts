import { describe, it, expect } from "vitest";
import { isSaturday, shabbatSaturdaysInRange } from "../src/lib/timezone";

/** UTC-midnight epoch for a civil date (the storage convention). */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("isSaturday (UTC-midnight convention)", () => {
  it("is true for a Saturday and false otherwise", () => {
    expect(isSaturday(d("2026-08-08"))).toBe(true); // Sat
    expect(isSaturday(d("2026-08-07"))).toBe(false); // Fri
    expect(isSaturday(d("2026-08-09"))).toBe(false); // Sun
  });
});

describe("shabbatSaturdaysInRange", () => {
  it("returns each Saturday within the stay∩query overlap", () => {
    // Two-week range spanning two Saturdays (Aug 8 and Aug 15, 2026).
    expect(shabbatSaturdaysInRange(d("2026-08-05"), d("2026-08-16"), d("2026-08-01"), d("2026-08-31"))).toEqual([
      "2026-08-08",
      "2026-08-15",
    ]);
  });

  it("clips to the query window", () => {
    expect(shabbatSaturdaysInRange(d("2026-08-05"), d("2026-08-16"), d("2026-08-10"), d("2026-08-12"))).toEqual([]);
    expect(shabbatSaturdaysInRange(d("2026-08-05"), d("2026-08-16"), d("2026-08-01"), d("2026-08-10"))).toEqual([
      "2026-08-08",
    ]);
  });

  it("returns empty when the range covers no Saturday", () => {
    expect(shabbatSaturdaysInRange(d("2026-08-09"), d("2026-08-14"), d("2026-08-01"), d("2026-08-31"))).toEqual([]);
  });
});
