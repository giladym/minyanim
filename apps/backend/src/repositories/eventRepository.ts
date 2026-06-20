import { and, eq, gte, lte, inArray, sql, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { event, minyan, commitment, eventRole, user } from "../db/schema";
import type { MinyanService, Nusach } from "@minyanim/shared";

export type EventRow = typeof event.$inferSelect;
export type EventInsert = typeof event.$inferInsert;
export type MinyanInsert = typeof minyan.$inferInsert;

/** A joined event + minyan-detail + host name row, as discovery / detail need it. */
export interface MinyanJoined {
  id: string;
  type: string;
  hostUserId: string;
  hostName: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  addressPrivate: string | null;
  eventDate: Date;
  notes: string | null;
  storedStatus: string;
  nusach: Nusach;
  seferTorah: boolean;
  services: MinyanService[];
  createdAt: Date;
  updatedAt: Date;
}

interface BboxQuery {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  from: Date;
  to: Date;
  nusach?: Nusach;
  seferTorah?: boolean;
}

const SELECT_JOINED = {
  id: event.id,
  type: event.type,
  hostUserId: event.hostUserId,
  hostName: user.name,
  city: event.city,
  country: event.country,
  lat: event.lat,
  lng: event.lng,
  addressPrivate: event.addressPrivate,
  eventDate: event.eventDate,
  notes: event.notes,
  storedStatus: event.status,
  nusach: minyan.nusach,
  seferTorah: minyan.seferTorah,
  services: minyan.services,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
} as const;

function mapJoined(r: Record<string, unknown>): MinyanJoined {
  return {
    id: r.id as string,
    type: r.type as string,
    hostUserId: r.hostUserId as string,
    hostName: r.hostName as string,
    city: r.city as string,
    country: r.country as string,
    lat: r.lat as number,
    lng: r.lng as number,
    addressPrivate: (r.addressPrivate as string | null) ?? null,
    eventDate: r.eventDate as Date,
    notes: (r.notes as string | null) ?? null,
    storedStatus: r.storedStatus as string,
    nusach: r.nusach as Nusach,
    seferTorah: Boolean(r.seferTorah),
    services: (r.services as MinyanService[]) ?? [],
    createdAt: (r.createdAt as Date) ?? new Date(0),
    updatedAt: (r.updatedAt as Date) ?? new Date(0),
  };
}

/**
 * Active (forming, non-hidden) minyanim within a bounding box whose date is in [from, to]. Filters
 * by nusach (with `any` always matching) and Sefer Torah when given. `completed` is excluded
 * in-service (derived). The `(status,type,event_date)` + `(lat,lng)` indexes back this scan.
 */
export async function listMinyanimInBbox(db: Db, q: BboxQuery): Promise<MinyanJoined[]> {
  const conds = [
    eq(event.type, "minyan"),
    eq(event.status, "forming"),
    eq(event.hidden, false),
    gte(event.lat, q.minLat),
    lte(event.lat, q.maxLat),
    gte(event.lng, q.minLng),
    lte(event.lng, q.maxLng),
    gte(event.eventDate, q.from),
    lte(event.eventDate, q.to),
  ];
  if (q.nusach) conds.push(or(eq(minyan.nusach, q.nusach), eq(minyan.nusach, "any"))!);
  if (q.seferTorah === true) conds.push(eq(minyan.seferTorah, true));

  const rows = await db
    .select(SELECT_JOINED)
    .from(event)
    .innerJoin(minyan, eq(minyan.eventId, event.id))
    .innerJoin(user, eq(user.id, event.hostUserId))
    .where(and(...conds));
  return rows.map(mapJoined);
}

/** Fetch one event joined with its minyan detail + host name (detail page / commit), or null. */
export async function getMinyanById(db: Db, id: string): Promise<MinyanJoined | null> {
  const rows = await db
    .select(SELECT_JOINED)
    .from(event)
    .innerJoin(minyan, eq(minyan.eventId, event.id))
    .innerJoin(user, eq(user.id, event.hostUserId))
    .where(eq(event.id, id))
    .limit(1);
  return rows[0] ? mapJoined(rows[0]) : null;
}

/** Summed committed men per event (single grouped query — R15). Returns a Map keyed by eventId. */
export async function committedMenByEvent(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: commitment.eventId, men: sql<number>`coalesce(sum(${commitment.numMen}), 0)` })
    .from(commitment)
    .where(inArray(commitment.eventId, eventIds))
    .groupBy(commitment.eventId);
  for (const r of rows) out.set(r.eventId, Number(r.men));
  return out;
}

/** Claimed roles per event (batched). Returns a Map eventId → {baalTefila, baalKorei} booleans. */
export async function rolesByEvent(
  db: Db,
  eventIds: string[],
): Promise<Map<string, { baalTefila: boolean; baalKorei: boolean }>> {
  const out = new Map<string, { baalTefila: boolean; baalKorei: boolean }>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: eventRole.eventId, role: eventRole.role })
    .from(eventRole)
    .where(inArray(eventRole.eventId, eventIds));
  for (const r of rows) {
    const cur = out.get(r.eventId) ?? { baalTefila: false, baalKorei: false };
    if (r.role === "baal_tefila") cur.baalTefila = true;
    if (r.role === "baal_korei") cur.baalKorei = true;
    out.set(r.eventId, cur);
  }
  return out;
}
