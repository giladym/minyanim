import { QUORUM, type MinyanService, type MinyanStatus, type MissingForReady } from "@minyanim/shared";
import { isSaturday, civilDate, todayCivil, tzFromCoords } from "./timezone";

/**
 * Whether a gathering includes a Shabbat-morning Shacharit (Torah-reading) — the only case where
 * Sefer Torah + Ba'al Korei are required for "ready" (D8/R4). Tz-free: `eventDate` is UTC midnight
 * of its civil date, so `isSaturday` reads the civil weekday directly.
 */
export function isShabbatShacharit(services: MinyanService[], eventDate: Date): boolean {
  return isSaturday(eventDate) && services.some((s) => s.tefilla === "shacharit");
}

export interface ReadinessInput {
  storedStatus: string;
  eventDate: Date;
  lat: number;
  lng: number;
  committedMen: number;
  seferTorah: boolean;
  services: MinyanService[];
  baalKoreiClaimed: boolean;
}

/** Whether the gathering's date has passed in the destination-local timezone (→ "completed", R4). */
export function isCompleted(eventDate: Date, lat: number, lng: number): boolean {
  return civilDate(eventDate, "UTC") < todayCivil(tzFromCoords(lat, lng));
}

/**
 * Derive a Minyan's status from stored inputs + counts (R4 truth table). `cancelled` (stored) and
 * `completed` (date past) override; otherwise quorum (≥10) and — for a Shabbat-morning Shacharit —
 * Sefer Torah + a claimed Ba'al Korei gate "ready".
 */
export function deriveStatus(i: ReadinessInput): MinyanStatus {
  if (i.storedStatus === "cancelled") return "cancelled";
  if (isCompleted(i.eventDate, i.lat, i.lng)) return "completed";
  if (i.committedMen < QUORUM) return "forming";
  if (isShabbatShacharit(i.services, i.eventDate) && !(i.seferTorah && i.baalKoreiClaimed)) {
    return "quorum-reached";
  }
  return "ready";
}

/** FR-006 — what a below-ready gathering still needs (Torah/Korei only count when applicable). */
export function missingForReady(i: ReadinessInput): MissingForReady {
  const needsTorah = isShabbatShacharit(i.services, i.eventDate);
  return {
    menShort: Math.max(0, QUORUM - i.committedMen),
    seferTorah: needsTorah ? !i.seferTorah : false,
    baalKorei: needsTorah ? !i.baalKoreiClaimed : false,
  };
}
