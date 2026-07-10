import { and, eq, gte, lte, ne, inArray, sql, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { event, minyan, commitment, eventRole, user, phoneNumber } from "../db/schema";
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
  hostImage: string | null;
  images: string[] | null;
  city: string;
  country: string;
  lat: number;
  lng: number;
  addressPrivate: string | null;
  addressNotes: string | null;
  eventDate: Date;
  notes: string | null;
  storedStatus: string;
  hidden: boolean;
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
  hostImage: user.image,
  images: event.images,
  city: event.city,
  country: event.country,
  lat: event.lat,
  lng: event.lng,
  addressPrivate: event.addressPrivate,
  addressNotes: event.addressNotes,
  eventDate: event.eventDate,
  notes: event.notes,
  storedStatus: event.status,
  hidden: event.hidden,
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
    hostImage: (r.hostImage as string | null) ?? null,
    images: (r.images as string[] | null) ?? null,
    city: r.city as string,
    country: r.country as string,
    lat: r.lat as number,
    lng: r.lng as number,
    addressPrivate: (r.addressPrivate as string | null) ?? null,
    addressNotes: (r.addressNotes as string | null) ?? null,
    eventDate: r.eventDate as Date,
    notes: (r.notes as string | null) ?? null,
    storedStatus: r.storedStatus as string,
    hidden: Boolean(r.hidden),
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

/**
 * Create a Minyan (event + 1:1 minyan detail + host self-commitment) in one `db.batch` (D11/R6).
 * `db.batch` pipelines but is NOT a rollback transaction — the caller assembles the DTO from the
 * validated inputs + generated ids rather than relying on batch RETURNING.
 */
export async function createMinyanBatch(
  db: Db,
  eventValues: EventInsert,
  minyanValues: MinyanInsert,
  hostCommitment: typeof commitment.$inferInsert,
): Promise<void> {
  await db.batch([
    db.insert(event).values(eventValues),
    db.insert(minyan).values(minyanValues),
    db.insert(commitment).values(hostCommitment),
  ]);
}

/** Patch an event's own columns (host-only enforced by the caller). Returns the updated row. */
export async function updateEventRow(db: Db, id: string, fields: Partial<EventInsert>): Promise<EventRow | null> {
  const rows = await db.update(event).set(fields).where(eq(event.id, id)).returning();
  return rows[0] ?? null;
}

/** Patch the minyan detail (nusach / seferTorah / services). */
export async function updateMinyanRow(db: Db, eventId: string, fields: Partial<MinyanInsert>): Promise<void> {
  await db.update(minyan).set(fields).where(eq(minyan.eventId, eventId));
}

/**
 * Cancel a Minyan: flip status → 'cancelled' and void all commitments + role claims, in one
 * `db.batch` (D11). Returns true if the event existed and was owned by `hostUserId`.
 */
export async function cancelMinyanBatch(db: Db, id: string, hostUserId: string): Promise<boolean> {
  const owned = await db
    .select({ id: event.id, status: event.status })
    .from(event)
    .where(and(eq(event.id, id), eq(event.hostUserId, hostUserId)))
    .limit(1);
  if (!owned[0]) return false;
  if (owned[0].status === "cancelled") return true; // idempotent — no re-void
  await db.batch([
    db.update(event).set({ status: "cancelled", updatedAt: new Date() }).where(eq(event.id, id)),
    db.delete(commitment).where(eq(commitment.eventId, id)),
    db.delete(eventRole).where(eq(eventRole.eventId, id)),
  ]);
  return true;
}

/** One commitment row, or null — for membership checks (DTO selection, duplicate guard). */
export async function getCommitment(db: Db, eventId: string, userId: string) {
  const rows = await db
    .select()
    .from(commitment)
    .where(and(eq(commitment.eventId, eventId), eq(commitment.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Participants of an event with their display name + email + party size (for the participant view). */
export async function participantsForEvent(db: Db, eventId: string) {
  return db
    .select({ userId: commitment.userId, numMen: commitment.numMen, name: user.name, email: user.email, sharePhone: user.sharePhone, image: user.image })
    .from(commitment)
    .innerJoin(user, eq(user.id, commitment.userId))
    .where(eq(commitment.eventId, eventId));
}

/** First phone (E.164) per user id, batched — for participant/host contact in the participant view. */
export async function firstPhonesByUser(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ userId: phoneNumber.userId, e164: phoneNumber.e164 })
    .from(phoneNumber)
    .where(inArray(phoneNumber.userId, userIds));
  for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, r.e164);
  return out;
}

/**
 * True if the user has a commitment to a non-cancelled event inside the bbox whose date falls in
 * [from, to] — i.e. they're already in a minyan for a stay at that place/time. Bbox + date only
 * (coordless stays can't answer this and are treated as "not committed nearby").
 */
export async function userCommittedNearby(
  db: Db,
  userId: string,
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  from: Date,
  to: Date,
): Promise<boolean> {
  const rows = await db
    .select({ id: commitment.id })
    .from(commitment)
    .innerJoin(event, eq(event.id, commitment.eventId))
    .where(
      and(
        eq(commitment.userId, userId),
        ne(event.status, "cancelled"),
        gte(event.lat, b.minLat),
        lte(event.lat, b.maxLat),
        gte(event.lng, b.minLng),
        lte(event.lng, b.maxLng),
        gte(event.eventDate, from),
        lte(event.eventDate, to),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
