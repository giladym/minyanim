/**
 * Per-Stay / per-Minyan Shabbat zmanim (Feature 005). Computed server-side from coordinates +
 * IANA timezone via `kosher-zmanim` (LGPL, server-side only) and returned as formatted local-time
 * strings — the library and raw astronomical values never cross to the client (D1). Hand-built TS
 * interfaces (no Zod): these are response shapes only, never parsed from inbound requests.
 */

/** Why a time is absent: polar no-sunset (`uncomputable`) or motzaei-Shabbat-into-Yom-Tov (D7/D2). */
export type ZmanimNote = "uncomputable" | "havdalah_yom_tov" | null;

/** One Shabbat's times, formatted `HH:mm` in the location's timezone (any may be null). */
export interface ShabbatZmanim {
  /** The Saturday civil date, `YYYY-MM-DD`. */
  shabbatDate: string;
  /** Friday sunset − offset (D3). */
  candleLighting: string | null;
  /** Saturday tzeit, Geonim ~8.5° (D4). */
  havdalahGeonim: string | null;
  /** Saturday nightfall, Rabbeinu Tam 72 min (D4). */
  havdalahRabbeinuTam: string | null;
  note: ZmanimNote;
}

/** The zmanim read payload for a Stay or Minyan. */
export interface ZmanimResponse {
  /** Whether the range includes a Shabbat (the 002 civil heuristic). */
  coversShabbat: boolean;
  /** False → coordless; the client shows the add-location CTA (D6); `shabbatot` is empty. */
  hasCoordinates: boolean;
  /** 18, or 40 for Jerusalem (D3) — for client labeling. */
  candleLightingOffsetMinutes: number;
  /** One entry per Shabbat in range, ascending; empty when `!coversShabbat` or `!hasCoordinates`. */
  shabbatot: ShabbatZmanim[];
}
