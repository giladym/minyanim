import tzlookup from "@photostructure/tz-lookup";

/**
 * Resolve the IANA timezone name for a coordinate pair using the offline `@photostructure/
 * tz-lookup` dataset (no network, workerd-safe). Falls back to "UTC" if the lookup fails.
 *
 * @param lat Latitude in decimal degrees.
 * @param lng Longitude in decimal degrees.
 * @returns IANA timezone identifier (e.g. "Asia/Jerusalem"), or "UTC" on failure.
 */
export function tzFromCoords(lat: number, lng: number): string {
  try {
    return tzlookup(lat, lng) ?? "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Format a Date as its civil ("YYYY-MM-DD") date in the given timezone. Uses
 * `Intl.DateTimeFormat("en-CA", …)` which yields ISO-ordered date parts — comparable
 * lexicographically. Never use epoch subtraction for date-only comparisons (D3/D4).
 *
 * @param date The instant to format.
 * @param tz IANA timezone identifier.
 * @returns The civil date as "YYYY-MM-DD".
 */
export function civilDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * The current civil date ("YYYY-MM-DD") in the given timezone.
 *
 * @param tz IANA timezone identifier.
 * @returns Today's civil date in `tz`.
 */
export function todayCivil(tz: string): string {
  return civilDate(new Date(), tz);
}

/**
 * Whether a date range overlaps a Friday or Saturday — a civil-calendar heuristic to suggest the
 * Shabbat prayer-needs default (D7). Dates are stored at UTC midnight of their civil date, so the
 * UTC weekday of each stored date IS its civil weekday. Iterates inclusive day-by-day from
 * arrival to departure.
 *
 * @param arrival Stored arrival date (UTC midnight of the civil date).
 * @param departure Stored departure date (UTC midnight of the civil date).
 * @param _tz IANA timezone (accepted for signature stability; not needed for UTC-midnight dates).
 * @returns True if any civil date in `[arrival, departure]` is a Friday (5) or Saturday (6).
 */
export function coversShabbat(arrival: Date, departure: Date, _tz: string): boolean {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = Date.UTC(
    arrival.getUTCFullYear(),
    arrival.getUTCMonth(),
    arrival.getUTCDate(),
  );
  const end = Date.UTC(
    departure.getUTCFullYear(),
    departure.getUTCMonth(),
    departure.getUTCDate(),
  );
  for (let t = start; t <= end; t += DAY_MS) {
    const day = new Date(t).getUTCDay();
    if (day === 5 || day === 6) return true;
  }
  return false;
}

/** UTC-midnight epoch of a stored civil date (normalizes any intra-day instant). */
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whether a stored civil date is a Saturday (Shabbat). Stored dates are UTC midnight of their
 * civil date, so the UTC weekday IS the civil weekday — no timezone needed (D2/R3/R4). Used for
 * the Shabbat-morning Torah-reading readiness classification.
 */
export function isSaturday(date: Date): boolean {
  return new Date(date).getUTCDay() === 6;
}

/**
 * The Saturday (Shabbat) civil dates — as "YYYY-MM-DD" — within `[arrival, departure] ∩ [from, to]`.
 * Tz-free (UTC-midnight convention, R3); used to bucket per-Shabbat discovery potential (FR-001).
 *
 * @param arrival Stay arrival (UTC midnight of civil date).
 * @param departure Stay departure (UTC midnight of civil date).
 * @param from Query window start (UTC midnight of civil date).
 * @param to Query window end (UTC midnight of civil date).
 * @returns Ascending list of Saturday civil dates in the overlap (empty if none).
 */
export function shabbatSaturdaysInRange(arrival: Date, departure: Date, from: Date, to: Date): string[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const lo = Math.max(utcMidnight(arrival), utcMidnight(from));
  const hi = Math.min(utcMidnight(departure), utcMidnight(to));
  const out: string[] = [];
  for (let t = lo; t <= hi; t += DAY_MS) {
    const d = new Date(t);
    if (d.getUTCDay() === 6) out.push(civilDate(d, "UTC"));
  }
  return out;
}
