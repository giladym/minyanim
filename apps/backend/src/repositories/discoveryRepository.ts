import { and, eq, gte, lte, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { stay, beitChabadPin } from "../db/schema";

export interface Bbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** The subset of a Stay needed to compute per-Shabbat potential. */
export interface PotentialStay {
  id: string;
  numMen: number;
  bringsSeferTorah: boolean;
  arrivalDate: Date;
  departureDate: Date;
}

const POTENTIAL_COLS = {
  id: stay.id,
  numMen: stay.numMen,
  bringsSeferTorah: stay.bringsSeferTorah,
  arrivalDate: stay.arrivalDate,
  departureDate: stay.departureDate,
} as const;

/** Active Stays with coordinates inside the bounding box (the indexed bbox scan, R2). */
export async function activeStaysInBbox(db: Db, b: Bbox): Promise<PotentialStay[]> {
  const rows = await db
    .select(POTENTIAL_COLS)
    .from(stay)
    .where(
      and(
        eq(stay.status, "active"),
        gte(stay.lat, b.minLat),
        lte(stay.lat, b.maxLat),
        gte(stay.lng, b.minLng),
        lte(stay.lng, b.maxLng),
      ),
    );
  return rows.map((r) => ({ ...r, bringsSeferTorah: Boolean(r.bringsSeferTorah) }));
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
    .where(
      and(
        eq(stay.status, "active"),
        isNull(stay.lat),
        eq(sql`lower(trim(${stay.city}))`, norm(city)),
        eq(sql`lower(trim(${stay.country}))`, norm(country)),
      ),
    );
  return rows.map((r) => ({ ...r, bringsSeferTorah: Boolean(r.bringsSeferTorah) }));
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
