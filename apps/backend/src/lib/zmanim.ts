import { ComplexZmanimCalendar, GeoLocation, JewishCalendar } from "kosher-zmanim";
import type { ShabbatZmanim, ZmanimNote } from "@minyanim/shared";
import { tzFromCoords } from "./timezone";

// Shabbat zmanim computed server-side with kosher-zmanim (LGPL — server-side only; only the
// formatted HH:mm strings cross to the client, never the library or raw astronomical values, D1).
// candle-lighting = Friday sunset − offset (18 min; 40 for Jerusalem, D3); Havdalah = Saturday
// nightfall by two opinions: Geonim ~8.5° and Rabbeinu Tam 72 min (D4). Derived at read time.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jerusalem (≈31.78N, 35.21E) gets the 40-minute candle-lighting custom (D3). Bounded-box
 * heuristic — a pin just outside the box falls back to 18 min, acceptable for v1. */
function isJerusalem(lat: number, lng: number): boolean {
  return Math.abs(lat - 31.78) <= 0.15 && Math.abs(lng - 35.21) <= 0.15;
}

/** The candle-lighting offset (minutes before sunset) for a location: 40 for Jerusalem, else 18. */
export function candleLightingOffsetMinutes(lat: number, lng: number): number {
  return isJerusalem(lat, lng) ? 40 : 18;
}

/** "YYYY-MM-DD" → a UTC-midnight Date (the civil-date convention used throughout the app). */
function civilToUtcDate(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

/**
 * Compute one Shabbat's zmanim for a location. `saturdayCivil` is the Saturday civil date
 * ("YYYY-MM-DD"); candle-lighting is taken on the preceding Friday, Havdalah on the Saturday.
 * Any time the astronomical engine can't resolve (e.g. polar no-sunset) comes back `null` with
 * `note:"uncomputable"`; if motzaei Shabbat runs straight into Yom Tov the Havdalah is suppressed
 * with `note:"havdalah_yom_tov"` (a deferred Havdalah must never be shown as a plain time, D2).
 */
export function computeShabbatZmanim(lat: number, lng: number, saturdayCivil: string): ShabbatZmanim {
  const tz = tzFromCoords(lat, lng);
  const geo = new GeoLocation("", lat, lng, 0, tz);
  const czc = new ComplexZmanimCalendar(geo);
  czc.setCandleLightingOffset(isJerusalem(lat, lng) ? 40 : 18);

  const saturday = civilToUtcDate(saturdayCivil);
  const friday = new Date(saturday.getTime() - DAY_MS);

  // candle-lighting on Friday.
  czc.setDate(friday);
  const candleLighting = fmt(czc.getCandleLighting(), tz);

  // Havdalah on Saturday (both opinions).
  czc.setDate(saturday);
  let havdalahGeonim = fmt(czc.getTzaisGeonim8Point5Degrees(), tz);
  let havdalahRabbeinuTam = fmt(czc.getTzais72(), tz);

  let note: ZmanimNote = null;

  // Yom-Tov guard: if the next civil day (motzaei Shabbat) is Yom Tov, Havdalah is deferred to
  // motzaei Yom Tov — suppress rather than show a wrong time (D2).
  const sunday = new Date(saturday.getTime() + DAY_MS);
  if (new JewishCalendar(sunday).isYomTov()) {
    havdalahGeonim = null;
    havdalahRabbeinuTam = null;
    note = "havdalah_yom_tov";
  } else if (candleLighting === null || havdalahGeonim === null || havdalahRabbeinuTam === null) {
    // Polar / no-sunset: the engine returned no time for at least one zman.
    note = "uncomputable";
  }

  return { shabbatDate: saturdayCivil, candleLighting, havdalahGeonim, havdalahRabbeinuTam, note };
}

/** Format a kosher-zmanim result (a UTC-zoned luxon DateTime, or null) as `HH:mm` in `tz`.
 * NOTE: the getters return UTC — `.setZone(tz)` is required or the time would be wrong (R2). */
function fmt(dt: { setZone(z: string): { toFormat(f: string): string } } | null, tz: string): string | null {
  return dt ? dt.setZone(tz).toFormat("HH:mm") : null;
}
