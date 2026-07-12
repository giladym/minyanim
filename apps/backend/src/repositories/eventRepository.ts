import { and, asc, eq, gte, lte, ne, inArray, sql, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { event, minyan, gathering, attendance, eventRole, user, phoneNumber } from "../db/schema";
import type {
  Category,
  EventType,
  GatheringAttrs,
  MinyanService,
  Nusach,
  Occasion,
  RsvpMode,
  Visibility,
} from "@minyanim/shared";

export type EventRow = typeof event.$inferSelect;
export type EventInsert = typeof event.$inferInsert;
export type MinyanInsert = typeof minyan.$inferInsert;
export type GatheringInsert = typeof gathering.$inferInsert;
export type AttendanceInsert = typeof attendance.$inferInsert;

/** Fields common to every joined event row (the generic axes live on `event`, 014). */
export interface EventJoinedBase {
  id: string;
  type: EventType;
  category: Category | null;
  hostUserId: string;
  hostName: string;
  hostImage: string | null;
  images: string[] | null;
  title: string | null;
  city: string;
  country: string;
  lat: number;
  lng: number;
  addressPrivate: string | null;
  addressNotes: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  occasion: Occasion | null;
  rsvpMode: RsvpMode;
  visibility: Visibility;
  capacity: number | null;
  rsvpCutoff: Date | null;
  notes: string | null;
  storedStatus: string;
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A joined event + minyan detail + host name row (discovery / detail need it). */
export interface MinyanJoined extends EventJoinedBase {
  type: "minyan";
  nusach: Nusach;
  seferTorah: boolean;
  services: MinyanService[];
}

/** A joined event + gathering detail + host name row. */
export interface GatheringJoined extends EventJoinedBase {
  type: "gathering";
  category: Category;
  attrs: GatheringAttrs;
}

/** Discriminated join shape — a row has minyan detail OR gathering detail (never both). */
export type EventJoined = MinyanJoined | GatheringJoined;

interface BboxQuery {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  from: Date;
  to: Date;
  nusach?: Nusach;
  seferTorah?: boolean;
  // 014 generic kind filters (default: all non-hidden forming).
  types?: EventType[];
  categories?: Category[];
  occasion?: Occasion;
}

const SELECT_JOINED = {
  id: event.id,
  type: event.type,
  category: event.category,
  hostUserId: event.hostUserId,
  hostName: user.name,
  hostImage: user.image,
  images: event.images,
  title: event.title,
  city: event.city,
  country: event.country,
  lat: event.lat,
  lng: event.lng,
  addressPrivate: event.addressPrivate,
  addressNotes: event.addressNotes,
  eventDate: event.eventDate,
  startTime: event.startTime,
  endTime: event.endTime,
  occasion: event.occasion,
  rsvpMode: event.rsvpMode,
  visibility: event.visibility,
  capacity: event.capacity,
  rsvpCutoff: event.rsvpCutoff,
  notes: event.notes,
  storedStatus: event.status,
  hidden: event.hidden,
  // minyan detail (null for a gathering)
  nusach: minyan.nusach,
  seferTorah: minyan.seferTorah,
  services: minyan.services,
  // gathering detail (null for a minyan)
  attrs: gathering.attrs,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
} as const;

function mapBase(r: Record<string, unknown>): EventJoinedBase {
  return {
    id: r.id as string,
    type: r.type as EventType,
    category: (r.category as Category | null) ?? null,
    hostUserId: r.hostUserId as string,
    hostName: r.hostName as string,
    hostImage: (r.hostImage as string | null) ?? null,
    images: (r.images as string[] | null) ?? null,
    title: (r.title as string | null) ?? null,
    city: r.city as string,
    country: r.country as string,
    lat: r.lat as number,
    lng: r.lng as number,
    addressPrivate: (r.addressPrivate as string | null) ?? null,
    addressNotes: (r.addressNotes as string | null) ?? null,
    eventDate: r.eventDate as Date,
    startTime: (r.startTime as string | null) ?? null,
    endTime: (r.endTime as string | null) ?? null,
    occasion: (r.occasion as Occasion | null) ?? null,
    rsvpMode: (r.rsvpMode as RsvpMode) ?? "open",
    visibility: (r.visibility as Visibility) ?? "public",
    capacity: (r.capacity as number | null) ?? null,
    rsvpCutoff: (r.rsvpCutoff as Date | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    storedStatus: r.storedStatus as string,
    hidden: Boolean(r.hidden),
    createdAt: (r.createdAt as Date) ?? new Date(0),
    updatedAt: (r.updatedAt as Date) ?? new Date(0),
  };
}

function mapJoined(r: Record<string, unknown>): EventJoined {
  const base = mapBase(r);
  if (base.type === "gathering") {
    return {
      ...base,
      type: "gathering",
      category: base.category as Category,
      attrs: (r.attrs as GatheringAttrs) ?? ({} as GatheringAttrs),
    };
  }
  return {
    ...base,
    type: "minyan",
    nusach: (r.nusach as Nusach) ?? "any",
    seferTorah: Boolean(r.seferTorah),
    services: (r.services as MinyanService[]) ?? [],
  };
}

/**
 * Active (forming, non-hidden, PUBLIC) events within a bounding box whose date is in [from, to] (any
 * type by default). `types`/`categories`/`occasion` narrow the set; `nusach`/`seferTorah` are
 * minyan-only sub-filters. `completed` is excluded in-service (derived); non-`public` visibility
 * (unlisted/invite are link-only, 014) is excluded here in SQL. Left-joins BOTH detail tables so a row
 * carries whichever detail it has. The `(status,type,event_date)` + `(lat,lng)` indexes back this scan.
 */
export async function listEventsInBbox(db: Db, q: BboxQuery): Promise<EventJoined[]> {
  const conds = [
    eq(event.status, "forming"),
    eq(event.hidden, false),
    eq(event.visibility, "public"),
    gte(event.lat, q.minLat),
    lte(event.lat, q.maxLat),
    gte(event.lng, q.minLng),
    lte(event.lng, q.maxLng),
    gte(event.eventDate, q.from),
    lte(event.eventDate, q.to),
  ];
  if (q.types && q.types.length > 0) conds.push(inArray(event.type, q.types));
  if (q.categories && q.categories.length > 0) conds.push(inArray(event.category, q.categories));
  if (q.occasion) conds.push(eq(event.occasion, q.occasion));
  // nusach/seferTorah are minyan-only sub-filters: a non-minyan row (left-joined minyan.* is NULL) is
  // left untouched by them (`ne(type,'minyan') OR minyan matches`), so gatherings still surface (014).
  if (q.nusach) conds.push(or(ne(event.type, "minyan"), eq(minyan.nusach, q.nusach), eq(minyan.nusach, "any"))!);
  if (q.seferTorah === true) conds.push(or(ne(event.type, "minyan"), eq(minyan.seferTorah, true))!);

  const rows = await db
    .select(SELECT_JOINED)
    .from(event)
    .leftJoin(minyan, eq(minyan.eventId, event.id))
    .leftJoin(gathering, eq(gathering.eventId, event.id))
    .innerJoin(user, eq(user.id, event.hostUserId))
    .where(and(...conds));
  return rows.map(mapJoined);
}

/** Minyan-only bbox scan (thin wrapper over {@link listEventsInBbox} for the discovery path). */
export async function listMinyanimInBbox(db: Db, q: Omit<BboxQuery, "types">): Promise<MinyanJoined[]> {
  const rows = await listEventsInBbox(db, { ...q, types: ["minyan"] });
  return rows.filter((r): r is MinyanJoined => r.type === "minyan");
}

/** Fetch one event joined with its detail + host name, or null. Discriminated on `type`. */
export async function getEventById(db: Db, id: string): Promise<EventJoined | null> {
  const rows = await db
    .select(SELECT_JOINED)
    .from(event)
    .leftJoin(minyan, eq(minyan.eventId, event.id))
    .leftJoin(gathering, eq(gathering.eventId, event.id))
    .innerJoin(user, eq(user.id, event.hostUserId))
    .where(eq(event.id, id))
    .limit(1);
  return rows[0] ? mapJoined(rows[0]) : null;
}

/** Fetch one minyan (its detail joined), or null if missing / not a minyan. */
export async function getMinyanById(db: Db, id: string): Promise<MinyanJoined | null> {
  const e = await getEventById(db, id);
  return e && e.type === "minyan" ? e : null;
}

/**
 * Summed CONFIRMED party sizes per event (a minyan reads it as committed men). Only
 * `status='confirmed'` attendances count (SC-005 audit #1). Returns a Map keyed by eventId.
 */
export async function committedMenByEvent(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: attendance.eventId, men: sql<number>`coalesce(sum(${attendance.partySize}), 0)` })
    .from(attendance)
    .where(and(inArray(attendance.eventId, eventIds), eq(attendance.status, "confirmed")))
    .groupBy(attendance.eventId);
  for (const r of rows) out.set(r.eventId, Number(r.men));
  return out;
}

/**
 * Create an event (event row + the correct 1:1 detail + optional host self-attendance) in one
 * `db.batch` (D11/R6). Host attendance is written ONLY for `hostSelfAttends` behaviors (minyan). The
 * caller assembles the DTO from the validated inputs rather than relying on batch RETURNING.
 */
export async function createEventBatch(
  db: Db,
  eventValues: EventInsert,
  detail: { kind: "minyan"; values: MinyanInsert } | { kind: "gathering"; values: GatheringInsert },
  hostAttendance?: AttendanceInsert,
): Promise<void> {
  const stmts: unknown[] = [
    db.insert(event).values(eventValues),
    detail.kind === "minyan"
      ? db.insert(minyan).values(detail.values)
      : db.insert(gathering).values(detail.values),
  ];
  if (hostAttendance) stmts.push(db.insert(attendance).values(hostAttendance));
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}

/** Back-compat wrapper: create a Minyan (event + minyan detail + host self-attendance). */
export async function createMinyanBatch(
  db: Db,
  eventValues: EventInsert,
  minyanValues: MinyanInsert,
  hostAttendance: AttendanceInsert,
): Promise<void> {
  await createEventBatch(db, eventValues, { kind: "minyan", values: minyanValues }, hostAttendance);
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

/** Patch the gathering detail (re-validated `attrs` blob). */
export async function updateGatheringRow(db: Db, eventId: string, fields: Partial<GatheringInsert>): Promise<void> {
  await db.update(gathering).set(fields).where(eq(gathering.eventId, eventId));
}

/** Event ids hosted by a user (T047 — notifying pending requesters when a host is sanctioned). */
export async function hostedEventIds(db: Db, hostUserId: string): Promise<string[]> {
  const rows = await db.select({ id: event.id }).from(event).where(eq(event.hostUserId, hostUserId));
  return rows.map((r) => r.id);
}

/**
 * Cancel an event: flip status → 'cancelled' and void all attendances + role claims, in one
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
    db.delete(attendance).where(eq(attendance.eventId, id)),
    db.delete(eventRole).where(eq(eventRole.eventId, id)),
  ]);
  return true;
}

/**
 * One CONFIRMED attendance row, or null — the address-reveal gate + role/host-transfer gates key on
 * this (SC-003 audit #2/#11/#12). A pending/waitlisted/declined/cancelled row is NOT "confirmed".
 */
export async function getConfirmedAttendance(db: Db, eventId: string, userId: string) {
  const rows = await db
    .select()
    .from(attendance)
    .where(
      and(eq(attendance.eventId, eventId), eq(attendance.userId, userId), eq(attendance.status, "confirmed")),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** One attendance row regardless of status (for the re-join upsert / My-events / duplicate checks). */
export async function getAttendance(db: Db, eventId: string, userId: string) {
  const rows = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.eventId, eventId), eq(attendance.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** CONFIRMED participants of an event with display name + email + party size (participant view). */
export async function participantsForEvent(db: Db, eventId: string) {
  return db
    .select({
      userId: attendance.userId,
      numMen: attendance.partySize,
      name: user.name,
      email: user.email,
      sharePhone: user.sharePhone,
      image: user.image,
    })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.eventId, eventId), eq(attendance.status, "confirmed")));
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
 * True if the user has a CONFIRMED attendance to a non-cancelled event inside the bbox whose date
 * falls in [from, to] (SC-005 audit #4). Bbox + date only.
 */
export async function userCommittedNearby(
  db: Db,
  userId: string,
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  from: Date,
  to: Date,
): Promise<boolean> {
  const rows = await db
    .select({ id: attendance.id })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .where(
      and(
        eq(attendance.userId, userId),
        eq(attendance.status, "confirmed"),
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

/** A compact "My events" query row — enough to derive the surfaced status without private fields. */
export interface MyEventQueryRow {
  id: string;
  type: EventType;
  category: Category | null;
  title: string | null;
  city: string;
  country: string;
  eventDate: Date;
  lat: number;
  lng: number;
  storedStatus: string;
  capacity: number | null;
  rsvpMode: RsvpMode;
  seferTorah: boolean;
  services: MinyanService[];
  myStatus: string | null;
}

const MY_EVENT_SELECT = {
  id: event.id,
  type: event.type,
  category: event.category,
  title: event.title,
  city: event.city,
  country: event.country,
  eventDate: event.eventDate,
  lat: event.lat,
  lng: event.lng,
  storedStatus: event.status,
  capacity: event.capacity,
  rsvpMode: event.rsvpMode,
  seferTorah: minyan.seferTorah,
  services: minyan.services,
} as const;

function mapMyEvent(r: Record<string, unknown>, myStatus: string | null): MyEventQueryRow {
  return {
    id: r.id as string,
    type: r.type as EventType,
    category: (r.category as Category | null) ?? null,
    title: (r.title as string | null) ?? null,
    city: r.city as string,
    country: r.country as string,
    eventDate: r.eventDate as Date,
    lat: r.lat as number,
    lng: r.lng as number,
    storedStatus: r.storedStatus as string,
    capacity: (r.capacity as number | null) ?? null,
    rsvpMode: (r.rsvpMode as RsvpMode) ?? "open",
    seferTorah: Boolean(r.seferTorah),
    services: (r.services as MinyanService[]) ?? [],
    myStatus,
  };
}

/** Events the user hosts (FR-017), earliest-first. Left-joins minyan detail (null for a gathering). */
export async function hostedEventsForUser(db: Db, userId: string): Promise<MyEventQueryRow[]> {
  const rows = await db
    .select(MY_EVENT_SELECT)
    .from(event)
    .leftJoin(minyan, eq(minyan.eventId, event.id))
    .where(eq(event.hostUserId, userId))
    .orderBy(asc(event.eventDate));
  return rows.map((r) => mapMyEvent(r, null));
}

/**
 * Events the user attends via a live attendance (confirmed/pending/waitlisted), earliest-first.
 * Excludes events the user hosts (those surface under "hosting"). Carries the viewer's `myStatus`.
 */
export async function attendingEventsForUser(db: Db, userId: string): Promise<MyEventQueryRow[]> {
  const rows = await db
    .select({ ...MY_EVENT_SELECT, myStatus: attendance.status })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .leftJoin(minyan, eq(minyan.eventId, event.id))
    .where(
      and(
        eq(attendance.userId, userId),
        ne(event.hostUserId, userId),
        inArray(attendance.status, ["confirmed", "pending", "waitlisted"]),
      ),
    )
    .orderBy(asc(event.eventDate));
  return rows.map((r) => mapMyEvent(r, (r.myStatus as string | null) ?? null));
}

/** Pending-request counts per event (approval-mode host badge). Map keyed by eventId (missing = 0). */
export async function pendingCountsByEvent(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: attendance.eventId, n: sql<number>`count(*)` })
    .from(attendance)
    .where(and(inArray(attendance.eventId, eventIds), eq(attendance.status, "pending")))
    .groupBy(attendance.eventId);
  for (const r of rows) out.set(r.eventId, Number(r.n));
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
