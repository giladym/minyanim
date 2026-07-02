import { describe, it, expect } from "vitest";
import { computeToday } from "../src/lib/calendar";

describe("computeToday (Hebrew calendar)", () => {
  it("computes the Hebrew date for a known Gregorian date (2026-06-18 = 3 Tammuz 5786)", () => {
    const t = computeToday(new Date("2026-06-18T12:00:00Z"));
    expect(t.hebrew.year).toBe(5786);
    expect(t.hebrew.monthKey).toBe("tamuz");
    expect(t.hebrew.day).toBe(3);
    expect(t.hebrew.formatted_he).toContain("תמוז");
    expect(t.gregorianDate).toBe("2026-06-18");
  });

  it("finds the upcoming holiday with he+en names (Rosh Chodesh Av)", () => {
    const t = computeToday(new Date("2026-06-18T12:00:00Z"));
    expect(t.upcomingHoliday).not.toBeNull();
    expect(t.upcomingHoliday!.nameHe).toContain("אב");
    expect(t.upcomingHoliday!.nameEn).toContain("Av");
    expect(t.upcomingHoliday!.inDays).toBeGreaterThan(0);
  });
});
