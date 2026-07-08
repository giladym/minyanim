import { and, eq, gte, lte, ne, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { stay, beitChabadPin, user } from "../db/schema";

export interface Bbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** The subset of a Stay needed to compute per-Shabbat potential + surface a traveler contact. */
export interface PotentialStay {
  id: string;
  userId: string;
  numMen: number;
  bringsSeferTorah: boolean;
  arrivalDate: Date;
  departureDate: Date;
  /** Per-stay contact (used for seeded/imported travelers with no user account). */
  contactName: string | null;
  contactPhone: string | null;
  /** The owning user's display name + phone-sharing preference (for registered travelers). */
  ownerName: string;
  ownerSharePhone: boolean;
  /** 'seed' = imported placeholder — contact is withheld in discovery until the person claims it. */
  ownerKind: string;
}

const POTENTIAL_COLS = {
  id: stay.id,
  userId: stay.userId,
  numMen: stay.numMen,
  bringsSeferTorah: stay.bringsSeferTorah,
  arrivalDate: stay.arrivalDate,
  departureDate: stay.departureDate,
  contactName: stay.contactName,
  contactPhone: stay.contactPhone,
  ownerName: user.name,
  ownerSharePhone: user.sharePhone,
  ownerKind: user.kind,
} as const;

const normalizeStay = (r: {
  id: string; userId: string; numMen: number; bringsSeferTorah: unknown; arrivalDate: Date; departureDate: Date;
  contactName: string | null; contactPhone: string | null; ownerName: string; ownerSharePhone: unknown; ownerKind: string;
}): PotentialStay => ({
  ...r,
  bringsSeferTorah: Boolean(r.bringsSeferTorah),
  ownerSharePhone: Boolean(r.ownerSharePhone),
});

/**
 * Distinct user ids with an ACTIVE Stay inside the bbox whose date range COVERS `date`
 * (arrival ≤ date ≤ departure), excluding `excludeUserId`. The recipient cohort to notify when a
 * minyan is hosted nearby on that Shabbat (FR: host→nearby notification).
 */
export async function activeStayUserIdsCoveringDate(
  db: Db,
  b: Bbox,
  date: Date,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: stay.userId })
    .from(stay)
    .where(
      and(
        eq(stay.status, "active"),
        gte(stay.lat, b.minLat),
        lte(stay.lat, b.maxLat),
        gte(stay.lng, b.minLng),
        lte(stay.lng, b.maxLng),
        lte(stay.arrivalDate, date),
        gte(stay.departureDate, date),
        ne(stay.userId, excludeUserId),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Active Stays with coordinates inside the bounding box (the indexed bbox scan, R2). */
export async function activeStaysInBbox(db: Db, b: Bbox): Promise<PotentialStay[]> {
  const rows = await db
    .select(POTENTIAL_COLS)
    .from(stay)
    .innerJoin(user, eq(user.id, stay.userId))
    .where(
      and(
        eq(stay.status, "active"),
        gte(stay.lat, b.minLat),
        lte(stay.lat, b.maxLat),
        gte(stay.lng, b.minLng),
        lte(stay.lng, b.maxLng),
      ),
    );
  return rows.map(normalizeStay);
}

/**
 * Active coordless Stays (manual entry) matching the queried city + country, case-insensitively
 * (R2 union path). Returned alongside the bbox set and deduped by id in the service.
 */
export async function coordlessActiveStays(
  db: Db,
  city: string,
  country: string,
): Promise<PotentialStay[]> {
  const norm = (s: string) => s.trim().toLowerCase();
  const rows = await db
    .select(POTENTIAL_COLS)
    .from(stay)
    .innerJoin(user, eq(user.id, stay.userId))
    .where(
      and(
        eq(stay.status, "active"),
        isNull(stay.lat),
        eq(sql`lower(trim(${stay.city}))`, norm(city)),
        eq(sql`lower(trim(${stay.country}))`, norm(country)),
      ),
    );
  return rows.map(normalizeStay);
}

/** Static Beit Chabad pins inside the bounding box (D18). */
export async function beitChabadInBbox(db: Db, b: Bbox) {
  return db
    .select({
      id: beitChabadPin.id,
      name: beitChabadPin.name,
      address: beitChabadPin.address,
      phone: beitChabadPin.phone,
      city: beitChabadPin.city,
      country: beitChabadPin.country,
      lat: beitChabadPin.lat,
      lng: beitChabadPin.lng,
    })
    .from(beitChabadPin)
    .where(
      and(
        gte(beitChabadPin.lat, b.minLat),
        lte(beitChabadPin.lat, b.maxLat),
        gte(beitChabadPin.lng, b.minLng),
        lte(beitChabadPin.lng, b.maxLng),
      ),
    );
}
