import { describe, it, expect } from "vitest";
import { JewishCalendar } from "kosher-zmanim";
import { computeShabbatZmanim } from "../src/lib/zmanim";

/** Minutes-of-day from an "HH:mm" string. */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

const KRAKOW = { lat: 50.0647, lng: 19.945 };
const JERUSALEM = { lat: 31.78, lng: 35.21 };

describe("computeShabbatZmanim", () => {
  it("returns evening LOCAL times for Kraków, correctly ordered (guards the UTC-format trap)", () => {
    // 2026-07-04 is a Saturday; Kraków is UTC+2 in summer.
    const z = computeShabbatZmanim(KRAKOW.lat, KRAKOW.lng, "2026-07-04");
    expect(z.note).toBeNull();
    for (const t of [z.candleLighting, z.havdalahGeonim, z.havdalahRabbeinuTam]) {
      expect(t).toMatch(/^\d{2}:\d{2}$/);
      // Summer-evening local hours (~20:00–23:00). If formatting forgot .setZone(tz) the value
      // would be ~2h earlier (UTC) and fall out of this band — the exact regression we guard.
      expect(toMin(t!)).toBeGreaterThan(toMin("19:00"));
      expect(toMin(t!)).toBeLessThan(toMin("23:59"));
    }
    // candle-lighting (Fri) < Geonim tzeit (Sat) < Rabbeinu Tam 72 (Sat, latest).
    expect(toMin(z.candleLighting!)).toBeLessThan(toMin(z.havdalahGeonim!));
    expect(toMin(z.havdalahGeonim!)).toBeLessThan(toMin(z.havdalahRabbeinuTam!));
  });

  it("applies the 40-minute candle-lighting custom for Jerusalem (≈22 min earlier than 18-min)", () => {
    const jlem = computeShabbatZmanim(JERUSALEM.lat, JERUSALEM.lng, "2026-07-04");
    // A point at the same latitude but just OUTSIDE the Jerusalem box (lng +0.3°) → 18-min offset.
    // Sunset differs by only ~1 min over 0.3° of longitude, so the candle-lighting gap ≈ 40−18 = 22.
    const nearby = computeShabbatZmanim(JERUSALEM.lat, JERUSALEM.lng + 0.3, "2026-07-04");
    const gap = toMin(nearby.candleLighting!) - toMin(jlem.candleLighting!);
    expect(gap).toBeGreaterThanOrEqual(20);
    expect(gap).toBeLessThanOrEqual(24);
  });

  it("returns null + note 'uncomputable' at a polar latitude in summer (no sunset)", () => {
    // Tromsø, late June — midnight sun, the sun never sets → no candle-lighting/tzeit.
    const z = computeShabbatZmanim(69.6496, 18.956, "2026-06-27");
    expect(z.candleLighting).toBeNull();
    expect(z.note).toBe("uncomputable");
  });

  it("suppresses Havdalah when motzaei Shabbat runs into Yom Tov (note 'havdalah_yom_tov')", () => {
    // Find a real Saturday in 2026–2027 whose next civil day (Sunday) is Yom Tov.
    let found: string | null = null;
    const start = Date.UTC(2026, 0, 3); // a Saturday
    for (let t = start; t < Date.UTC(2028, 0, 1) && !found; t += 7 * 86400000) {
      const sunday = new Date(t + 86400000);
      if (new JewishCalendar(sunday).isYomTov()) found = new Date(t).toISOString().slice(0, 10);
    }
    expect(found).not.toBeNull();
    const z = computeShabbatZmanim(JERUSALEM.lat, JERUSALEM.lng, found!);
    expect(z.havdalahGeonim).toBeNull();
    expect(z.havdalahRabbeinuTam).toBeNull();
    expect(z.note).toBe("havdalah_yom_tov");
    // Candle-lighting (Friday) is still shown.
    expect(z.candleLighting).toMatch(/^\d{2}:\d{2}$/);
  });
});
