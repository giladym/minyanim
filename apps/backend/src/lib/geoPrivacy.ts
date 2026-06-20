/**
 * Public-coordinate fuzzing (D4 decision, 2026-06-21): a hosted Minyan's exact point is private
 * until a user commits. The PUBLIC projection rounds lat/lng to ~neighbourhood precision so the
 * map pin is approximate; the exact coordinates are returned only in the participant/owner views.
 *
 * 2 decimal places ≈ 1.1 km at the equator (less nearer the poles) — enough to place a pin in the
 * right area without revealing the building.
 */
export function fuzzCoord(n: number): number {
  return Math.round(n * 100) / 100;
}
