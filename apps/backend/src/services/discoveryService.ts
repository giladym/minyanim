import {
  DISCOVERY_RADIUS_KM,
  type DiscoveryQueryType,
  type DiscoveryResult,
  type PotentialBucket,
  type PublicMinyanDTO,
} from "@minyanim/shared";
import type { Db } from "../db/client";
import { getStayById, listStays } from "./../repositories/stayRepository";
import { shabbatSaturdaysInRange } from "../lib/timezone";
import { deriveStatus, missingForReady, isShabbatShacharit } from "../lib/minyanStatus";
import { fuzzCoord } from "../lib/geoPrivacy";
import {
  listMinyanimInBbox,
  committedMenByEvent,
  rolesByEvent,
  type MinyanJoined,
} from "../repositories/eventRepository";
import {
  activeStaysInBbox,
  coordlessActiveStays,
  beitChabadInBbox,
  type Bbox,
  type PotentialStay,
} from "../repositories/discoveryRepository";

const ATTRIBUTION = "© MapTiler © OpenStreetMap contributors";

/** Bounding box from a centre + radius. `cos(lat)` is floored to avoid the near-pole blow-up (R2). */
export function bboxFrom(lat: number, lng: number, radiusKm: number): Bbox {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

/** Bucket active Stays into per-Shabbat potential within [from, to] (D2/R3). */
function bucketPotential(stays: PotentialStay[], from: Date, to: Date): PotentialBucket[] {
  const byShabbat = new Map<string, { menCount: number; seferTorahCount: number }>();
  for (const s of stays) {
    for (const shabbat of shabbatSaturdaysInRange(s.arrivalDate, s.departureDate, from, to)) {
      const cur = byShabbat.get(shabbat) ?? { menCount: 0, seferTorahCount: 0 };
      cur.menCount += s.numMen;
      if (s.bringsSeferTorah) cur.seferTorahCount += 1;
      byShabbat.set(shabbat, cur);
    }
  }
  return [...byShabbat.entries()]
    .map(([shabbat, v]) => ({ shabbat, ...v }))
    .sort((a, b) => a.shabbat.localeCompare(b.shabbat));
}

/** Assemble the public DTO for one minyan from its joined row + derived counts/roles. */
function toPublicMinyan(
  m: MinyanJoined,
  committedMen: number,
  roles: { baalTefila: boolean; baalKorei: boolean },
): PublicMinyanDTO {
  const readiness = {
    storedStatus: m.storedStatus,
    eventDate: m.eventDate,
    lat: m.lat,
    lng: m.lng,
    committedMen,
    seferTorah: m.seferTorah,
    services: m.services,
    baalKoreiClaimed: roles.baalKorei,
  };
  return {
    id: m.id,
    type: "minyan",
    city: m.city,
    country: m.country,
    // Discovery is public — fuzz the pin to ~neighbourhood (exact reveals on commit, D4).
    lat: fuzzCoord(m.lat),
    lng: fuzzCoord(m.lng),
    eventDate: m.eventDate.getTime(),
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    services: m.services,
    notes: m.notes,
    hostName: m.hostName,
    committedMen,
    status: deriveStatus(readiness),
    isShabbatShacharit: isShabbatShacharit(m.services, m.eventDate),
    missingForReady: missingForReady(readiness),
    rolesFilled: roles,
    createdAt: m.createdAt.getTime(),
    updatedAt: m.updatedAt.getTime(),
  };
}

/**
 * Discovery (FR-001): per-Shabbat potential (summed men from Stays in the area) + hosted Minyanim
 * (address-free public DTOs), excluding `completed` (derived) and `cancelled`/`hidden` (in SQL).
 * Requires no Stay of the caller's own (D22).
 */
export async function discover(db: Db, q: DiscoveryQueryType): Promise<DiscoveryResult> {
  const from = new Date(q.from);
  const to = new Date(q.to);
  const hasCoords = typeof q.lat === "number" && typeof q.lng === "number";
  const bbox = hasCoords ? bboxFrom(q.lat!, q.lng!, q.radiusKm) : null;

  // Potential: bbox-matched coord Stays UNION coordless city/country matches, deduped by id (R2).
  const staysById = new Map<string, PotentialStay>();
  if (bbox) for (const s of await activeStaysInBbox(db, { ...bbox, from, to } as Bbox)) staysById.set(s.id, s);
  if (q.city && q.country) {
    for (const s of await coordlessActiveStays(db, q.city, q.country)) staysById.set(s.id, s);
  }
  const potential = bucketPotential([...staysById.values()], from, to);

  // Hosted minyanim (bbox + filters); derive status and drop `completed`.
  let minyanim: PublicMinyanDTO[] = [];
  if (bbox) {
    const rows = await listMinyanimInBbox(db, {
      ...bbox,
      from,
      to,
      nusach: q.nusach,
      seferTorah: q.seferTorah,
    });
    const ids = rows.map((r) => r.id);
    const [men, roles] = await Promise.all([committedMenByEvent(db, ids), rolesByEvent(db, ids)]);
    minyanim = rows
      .map((r) => toPublicMinyan(r, men.get(r.id) ?? 0, roles.get(r.id) ?? { baalTefila: false, baalKorei: false }))
      .filter((m) => m.status !== "completed");
  }

  const beitChabad = bbox ? await beitChabadInBbox(db, bbox) : [];
  return { potential, minyanim, beitChabad, attribution: ATTRIBUTION };
}

/** Build the discovery query that matches a Stay's location + date range (FR-019/D22). */
function queryForStay(s: { lat: number | null; lng: number | null; city: string; country: string; arrivalDate: Date; departureDate: Date }): DiscoveryQueryType {
  const base = { radiusKm: DISCOVERY_RADIUS_KM, from: s.arrivalDate.getTime(), to: s.departureDate.getTime() };
  return s.lat != null && s.lng != null
    ? { ...base, lat: s.lat, lng: s.lng }
    : { ...base, city: s.city, country: s.country };
}

/** Potential + hosted minyanim near an owned Stay (FR-019 pull). Null if the Stay isn't owned. */
export async function nearStay(db: Db, userId: string, stayId: string): Promise<DiscoveryResult | null> {
  const stay = await getStayById(db, userId, stayId);
  if (!stay) return null;
  return discover(db, queryForStay(stay));
}

/** Batched count of nearby hosted minyanim per active Stay, for the My-Stays dashboard (R15). */
export async function nearStayCounts(db: Db, userId: string): Promise<Record<string, number>> {
  const stays = await listStays(db, userId);
  const counts: Record<string, number> = {};
  for (const s of stays) {
    counts[s.id] = (await discover(db, queryForStay(s))).minyanim.length;
  }
  return counts;
}
