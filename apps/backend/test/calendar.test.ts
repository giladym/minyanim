import { SELF } from "cloudflare:test";
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

// The HTTP route (previously only the lib above was tested). Public, no auth. It takes a client
// `date` (YYYY-MM-DD) and returns the same shape computeToday() produces, with a cache header.
describe("GET /api/calendar/today", () => {
  it("returns the Hebrew date for a passed civil date (public, no auth) with a cache header", async () => {
    const res = await SELF.fetch("https://x/api/calendar/today?date=2026-06-18");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    const body = (await res.json()) as { hebrew: { year: number; monthKey: string; day: number }; gregorianDate: string };
    expect(body.hebrew).toMatchObject({ year: 5786, monthKey: "tamuz", day: 3 });
    expect(body.gregorianDate).toBe("2026-06-18");
  });

  it("ignores a malformed date and still returns a valid payload (falls back to now)", async () => {
    const res = await SELF.fetch("https://x/api/calendar/today?date=not-a-date");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hebrew: { year: number }; gregorianDate: string };
    expect(body.hebrew.year).toBeGreaterThan(5700);
    expect(body.gregorianDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("works with no date query at all", async () => {
    const res = await SELF.fetch("https://x/api/calendar/today");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { hebrew: { year: number } }).hebrew.year).toBeGreaterThan(5700);
  });
});
