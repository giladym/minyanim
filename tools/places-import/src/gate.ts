/**
 * STEP 3 — quality gates. Dedupe by source id (idempotency key) and by PROXIMITY (near-identical
 * places across a pull), and flag records that shouldn't be created. Everything the gate rejects is
 * reported (never silently dropped). Pure + testable.
 */
import type { PlaceRecord } from "./map.ts";

export interface Rejected {
  record: PlaceRecord;
  reason: "duplicate_source_id" | "duplicate_proximity" | "missing_coords";
}

export interface GateResult {
  accepted: PlaceRecord[];
  rejected: Rejected[];
}

/** Rough metres between two lat/lng (equirectangular — fine for a ~tens-of-metres dedupe threshold). */
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = (((bLng - aLng) * Math.PI) / 180) * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng) * R;
}

const PROXIMITY_M = 40;

/**
 * Accept records, rejecting: coordless (defensive — map already drops these), exact source-id repeats,
 * and same-name places within PROXIMITY_M of an already-accepted one (cross-source/dup pins).
 */
export function gate(records: PlaceRecord[]): GateResult {
  const accepted: PlaceRecord[] = [];
  const rejected: Rejected[] = [];
  const seenIds = new Set<string>();

  for (const r of records) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
      rejected.push({ record: r, reason: "missing_coords" });
      continue;
    }
    const idKey = `${r.source}/${r.sourceId}`;
    if (seenIds.has(idKey)) {
      rejected.push({ record: r, reason: "duplicate_source_id" });
      continue;
    }
    const near = accepted.find(
      (a) => a.name === r.name && metersBetween(a.lat, a.lng, r.lat, r.lng) <= PROXIMITY_M,
    );
    if (near) {
      rejected.push({ record: r, reason: "duplicate_proximity" });
      continue;
    }
    seenIds.add(idKey);
    accepted.push(r);
  }
  return { accepted, rejected };
}
