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
