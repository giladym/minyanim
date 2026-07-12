import {
  DISCOVERY_RADIUS_KM,
  type DiscoveryQueryType,
  type DiscoveryResult,
  type PotentialBucket,
  type TravelerContact,
  type PublicMinyanDTO,
  type PublicGatheringDTO,
  type PublicEventDTO,
} from "@minyanim/shared";
import type { Db } from "../db/client";
import { getStayById, listStays } from "./../repositories/stayRepository";
import { shabbatSaturdaysInRange } from "../lib/timezone";
import { deriveStatus, missingForReady, isShabbatShacharit, isCompleted } from "../lib/minyanStatus";
import { gatheringStatus, seatsRemaining } from "../lib/eventStrategy";
import { fuzzCoord } from "../lib/geoPrivacy";
import {
  listEventsInBbox,
  committedMenByEvent,
  rolesByEvent,
  firstPhonesByUser,
  userCommittedNearby,
  type MinyanJoined,
  type GatheringJoined,
} from "../repositories/eventRepository";
import {
  activeStaysInBbox,
  activeStayUserIdsCoveringDate,
  coordlessActiveStays,
  type Bbox,
  type PotentialStay,
} from "../repositories/discoveryRepository";
import { placesInBbox, listActiveLayers } from "../repositories/placesRepository";
import { toPlaceDTO, toLayerDTO } from "./placesService";

const ATTRIBUTION = "© MapTiler © OpenStreetMap contributors";

/** Bounding box from a centre + radius. `cos(lat)` is floored to avoid the near-pole blow-up (R2). */
export function bboxFrom(lat: number, lng: number, radiusKm: number): Bbox {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

/** User ids (excluding the host) with an active Stay within the discovery radius of (lat,lng) whose
 * range covers `date` — the people to notify when a minyan is hosted there. */
export function usersWithStaysNear(db: Db, lat: number, lng: number, date: Date, excludeUserId: string): Promise<string[]> {
  return activeStayUserIdsCoveringDate(db, bboxFrom(lat, lng, DISCOVERY_RADIUS_KM), date, excludeUserId);
}

/** A traveler's contact: a seeded per-stay contact takes precedence (imported people with no
 * account); otherwise the owning user's name + phone, the phone only if they share it. A 'seed'
 * (imported placeholder) owner NEVER exposes a phone until the person claims their trips (F4) —
 * they haven't consented to sharing — but their name still surfaces so others know who's around. */
function travelerContact(s: PotentialStay, phones: Map<string, string>): TravelerContact {
  const phone = s.ownerKind === "seed" ? null : s.contactPhone ?? (s.ownerSharePhone ? phones.get(s.userId) ?? null : null);
  return { name: s.contactName ?? s.ownerName, phone, numMen: s.numMen };
}

/** Bucket active Stays into per-Shabbat potential within [from, to] (D2/R3), attaching each
 * covering traveler's contact so a signed-in viewer can reach out to form a minyan. */
function bucketPotential(stays: PotentialStay[], from: Date, to: Date, phones: Map<string, string>): PotentialBucket[] {
  const byShabbat = new Map<string, { menCount: number; seferTorahCount: number; travelers: TravelerContact[] }>();
  for (const s of stays) {
    const contact = travelerContact(s, phones);
    for (const shabbat of shabbatSaturdaysInRange(s.arrivalDate, s.departureDate, from, to)) {
      const cur = byShabbat.get(shabbat) ?? { menCount: 0, seferTorahCount: 0, travelers: [] };
      cur.menCount += s.numMen;
      if (s.bringsSeferTorah) cur.seferTorahCount += 1;
      cur.travelers.push(contact);
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
  viewerId: string | null,
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
  const rsvpState =
    (m.rsvpCutoff && m.rsvpCutoff.getTime() < Date.now()) || isCompleted(m.eventDate, m.lat, m.lng)
      ? "closed"
      : "open";
  return {
    id: m.id,
    type: "minyan",
    category: null,
    occasion: m.occasion,
    title: m.title,
    city: m.city,
    country: m.country,
    // Discovery is public — fuzz the pin to ~neighbourhood (exact reveals on commit, D4).
    lat: fuzzCoord(m.lat),
    lng: fuzzCoord(m.lng),
    eventDate: m.eventDate.getTime(),
    startTime: m.startTime,
    endTime: m.endTime,
    rsvpCutoff: m.rsvpCutoff ? m.rsvpCutoff.getTime() : null,
    rsvpMode: m.rsvpMode,
    visibility: m.visibility,
    capacity: null,
    seatsRemaining: null,
    rsvpState,
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    services: m.services,
    notes: m.notes,
    hostName: m.hostName,
    hostImage: m.hostImage,
    images: m.images ?? null,
    committedMen,
    status: deriveStatus(readiness),
    isShabbatShacharit: isShabbatShacharit(m.services, m.eventDate),
    missingForReady: missingForReady(readiness),
    rolesFilled: roles,
    viewerIsHost: viewerId !== null && m.hostUserId === viewerId,
    createdAt: m.createdAt.getTime(),
    updatedAt: m.updatedAt.getTime(),
  };
}

/** Assemble the public DTO for one gathering (hosting/social) — fuzzed coords, address-free, with the
 * validated `attrs`, derived `status`/`seatsRemaining`/`confirmedCount` (mirrors eventService's public
 * gathering builder; kept local so discovery stays a single self-contained projection, like the minyan
 * one above). `confirmedCount` is the confirmed party-size sum. */
function toPublicGathering(g: GatheringJoined, confirmedCount: number, viewerId: string | null): PublicGatheringDTO {
  const rsvpState =
    (g.rsvpCutoff && g.rsvpCutoff.getTime() < Date.now()) || isCompleted(g.eventDate, g.lat, g.lng)
      ? "closed"
      : "open";
  return {
    id: g.id,
    type: "gathering",
    category: g.category,
    occasion: g.occasion,
    title: g.title,
    city: g.city,
    country: g.country,
    // Discovery is public — fuzz the pin to ~neighbourhood (exact reveals on confirm, D4/SC-003).
    lat: fuzzCoord(g.lat),
    lng: fuzzCoord(g.lng),
    eventDate: g.eventDate.getTime(),
    startTime: g.startTime,
    endTime: g.endTime,
    rsvpCutoff: g.rsvpCutoff ? g.rsvpCutoff.getTime() : null,
    rsvpMode: g.rsvpMode,
    visibility: g.visibility,
    capacity: g.capacity,
    seatsRemaining: seatsRemaining(g.capacity, confirmedCount),
    rsvpState,
    notes: g.notes,
    hostName: g.hostName,
    hostImage: g.hostImage,
    images: g.images ?? null,
    attrs: g.attrs,
    status: gatheringStatus({
      storedStatus: g.storedStatus,
      eventDate: g.eventDate,
      lat: g.lat,
      lng: g.lng,
      capacity: g.capacity,
      confirmedPartySize: confirmedCount,
    }),
    confirmedCount,
    viewerIsHost: viewerId !== null && g.hostUserId === viewerId,
    createdAt: g.createdAt.getTime(),
    updatedAt: g.updatedAt.getTime(),
  };
}

/**
 * Discovery (FR-001, generalized in 014 US2): per-Shabbat potential (summed men from Stays in the
 * area) + hosted events of ALL in-scope kinds (minyan + gatherings) as address-free public DTOs,
 * filtered by `types`/`categories`/`occasion` (+ minyan-only `nusach`/`seferTorah`). Excludes
 * `completed` (derived) and `cancelled`/`hidden`/non-`public` visibility (in SQL). Requires no Stay of
 * the caller's own (D22).
 */
export async function discover(db: Db, q: DiscoveryQueryType, viewerId: string | null = null): Promise<DiscoveryResult> {
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
  const stays = [...staysById.values()];
  // Owners' first phones (only those who share and have no explicit per-stay contact phone).
  const phoneUserIds = stays.filter((s) => !s.contactPhone && s.ownerSharePhone).map((s) => s.userId);
  const ownerPhones = await firstPhonesByUser(db, phoneUserIds);
  const potential = bucketPotential(stays, from, to, ownerPhones);

  // Hosted events of every in-scope kind (bbox + kind/occasion filters); derive status, drop `completed`.
  let events: PublicEventDTO[] = [];
  if (bbox) {
    const rows = await listEventsInBbox(db, {
      ...bbox,
      from,
      to,
      types: q.types,
      categories: q.categories,
      occasion: q.occasion,
      nusach: q.nusach,
      seferTorah: q.seferTorah,
    });
    const ids = rows.map((r) => r.id);
    // Confirmed party-size sums (a minyan reads it as committed men; a gathering as confirmedCount).
    // Roles are minyan-only; a gathering id simply misses the map (default = none).
    const [men, roles] = await Promise.all([committedMenByEvent(db, ids), rolesByEvent(db, ids)]);
    events = rows
      .map((r): PublicEventDTO =>
        r.type === "minyan"
          ? toPublicMinyan(r, men.get(r.id) ?? 0, roles.get(r.id) ?? { baalTefila: false, baalKorei: false }, viewerId)
          : toPublicGathering(r, men.get(r.id) ?? 0, viewerId),
      )
      .filter((e) => e.status !== "completed");
  }

  // Kosher/Jewish places in the viewport via the generic 010 layer model (Chabad houses among them).
  const [placeRows, layerRows] = await Promise.all([
    bbox ? placesInBbox(db, bbox) : Promise.resolve([]),
    listActiveLayers(db),
  ]);
  return {
    potential,
    // All in-scope kinds (minyan + gatherings), address-free + fuzzed (US2, T033).
    events,
    places: placeRows.map(toPlaceDTO),
    layers: layerRows.map(toLayerDTO),
    attribution: ATTRIBUTION,
  };
}

/** Build the discovery query that matches a Stay's location + date range (FR-019/D22). */
function queryForStay(s: { lat: number | null; lng: number | null; city: string; country: string; arrivalDate: Date; departureDate: Date }): DiscoveryQueryType {
  const base = { radiusKm: DISCOVERY_RADIUS_KM, from: s.arrivalDate.getTime(), to: s.departureDate.getTime(), types: undefined, categories: undefined };
  return s.lat != null && s.lng != null
    ? { ...base, lat: s.lat, lng: s.lng }
    : { ...base, city: s.city, country: s.country };
}

/** Potential + hosted events (all kinds) near an owned Stay (FR-019 pull). Null if the Stay isn't owned. */
export async function nearStay(db: Db, userId: string, stayId: string): Promise<DiscoveryResult | null> {
  const stay = await getStayById(db, userId, stayId);
  if (!stay) return null;
  return discover(db, queryForStay(stay), userId);
}

/** Per-active-Stay dashboard signals (R15): count of nearby hosted MINYANIM (the dashboard signal is
 * minyan-specific — unchanged from today), and whether the user is already committed to a minyan at
 * that place/time. Discovery now surfaces all kinds, so we count only the minyan events here. */
export async function nearStayCounts(
  db: Db,
  userId: string,
): Promise<{ counts: Record<string, number>; committed: Record<string, boolean> }> {
  const stays = await listStays(db, userId);
  const counts: Record<string, number> = {};
  const committed: Record<string, boolean> = {};
  for (const s of stays) {
    counts[s.id] = (await discover(db, queryForStay(s), userId)).events.filter((e) => e.type === "minyan").length;
    committed[s.id] =
      s.lat != null && s.lng != null
        ? await userCommittedNearby(db, userId, bboxFrom(s.lat, s.lng, DISCOVERY_RADIUS_KM), s.arrivalDate, s.departureDate)
        : false;
  }
  return { counts, committed };
}
