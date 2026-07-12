import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { attendance, user } from "../db/schema";

/**
 * Generalized attendance writes (014, R4). Every `→confirmed` transition is a SINGLE self-contained
 * SQL statement whose guard reads committed state — D1 serializes writes, so the guard sees prior
 * commits (the atomicity source; `db.batch` only pipelines). Capacity is the CONFIRMED party-size
 * SUM (host is never a gathering attendance row, R12), so over-book is structurally impossible
 * (SC-006). Re-join after cancel/decline UPDATEs the same `(event_id,user_id)` row (soft, R14).
 */

const TERMINAL = sql`('cancelled','declined')`;
/** Confirmed party-size sum for an event (excludes the conflicting row on a re-join — it is terminal). */
const CONFIRMED_SUM = (eventId: string) =>
  sql`coalesce((select sum(party_size) from attendance where event_id = ${eventId} and status = 'confirmed'), 0)`;

/** Confirmed party-size sum for one event (0 when none). */
export async function confirmedPartySize(db: Db, eventId: string): Promise<number> {
  const rows = await db.all<{ n: number }>(
    sql`select ${CONFIRMED_SUM(eventId)} as n`,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Open-mode join (R4): one guarded `INSERT … SELECT … RETURNING status`. Computes confirmed vs
 * waitlisted atomically; a re-join (terminal row) UPDATEs back. Returns the resulting status, or
 * `null` when the row is already live (the `setWhere` guard skipped the update → duplicate).
 */
export async function joinOpen(
  db: Db,
  args: { id: string; eventId: string; userId: string; partySize: number; stayId: string | null; now: number; capacity: number | null },
): Promise<"confirmed" | "waitlisted" | null> {
  const { id, eventId, userId, partySize, stayId, now, capacity } = args;
  const fits = sql`(${capacity} is null or (${CONFIRMED_SUM(eventId)} + ${partySize}) <= ${capacity})`;
  const rows = await db.all<{ status: string }>(sql`
    insert into attendance (id, event_id, user_id, party_size, status, stay_id, requested_at, created_at, updated_at)
    select ${id}, ${eventId}, ${userId}, ${partySize},
      case when ${fits} then 'confirmed' else 'waitlisted' end,
      ${stayId}, ${now}, ${now}, ${now}
    on conflict(event_id, user_id) do update set
      party_size = excluded.party_size,
      stay_id = excluded.stay_id,
      requested_at = excluded.requested_at,
      updated_at = excluded.updated_at,
      status = case when ${fits} then 'confirmed' else 'waitlisted' end
    where attendance.status in ${TERMINAL}
    returning status
  `);
  return (rows[0]?.status as "confirmed" | "waitlisted" | undefined) ?? null;
}

/**
 * Approval-mode request (R4): → `pending` always (no capacity math at request time). Re-request
 * after a prior cancel/decline UPDATEs the same row. Returns 'pending', or null if already live.
 */
export async function requestSeat(
  db: Db,
  args: { id: string; eventId: string; userId: string; partySize: number; stayId: string | null; now: number },
): Promise<"pending" | null> {
  const { id, eventId, userId, partySize, stayId, now } = args;
  const rows = await db.all<{ status: string }>(sql`
    insert into attendance (id, event_id, user_id, party_size, status, stay_id, requested_at, created_at, updated_at)
    select ${id}, ${eventId}, ${userId}, ${partySize}, 'pending', ${stayId}, ${now}, ${now}, ${now}
    on conflict(event_id, user_id) do update set
      party_size = excluded.party_size,
      stay_id = excluded.stay_id,
      requested_at = excluded.requested_at,
      updated_at = excluded.updated_at,
      status = 'pending'
    where attendance.status in ${TERMINAL}
    returning status
  `);
  return (rows[0]?.status as "pending" | undefined) ?? null;
}

/**
 * Guarded approve (R4): `UPDATE … WHERE id=? AND status='pending' AND fits RETURNING id`. 0 rows is
 * ambiguous (not-pending vs capacity-full) — the caller disambiguates with one cheap read.
 */
export async function approveRequest(
  db: Db,
  eventId: string,
  attendanceId: string,
  capacity: number | null,
  now: number,
): Promise<boolean> {
  const fits = sql`(${capacity} is null or (${CONFIRMED_SUM(eventId)} + party_size) <= ${capacity})`;
  const rows = await db.all<{ id: string }>(sql`
    update attendance set status = 'confirmed', updated_at = ${now}
    where id = ${attendanceId} and event_id = ${eventId} and status = 'pending' and ${fits}
    returning id
  `);
  return rows.length > 0;
}

/** Decline a pending request (R4): → 'declined'. True if a pending row transitioned. */
export async function declineRequest(db: Db, eventId: string, attendanceId: string, now: number): Promise<boolean> {
  const rows = await db.all<{ id: string }>(sql`
    update attendance set status = 'declined', updated_at = ${now}
    where id = ${attendanceId} and event_id = ${eventId} and status = 'pending'
    returning id
  `);
  return rows.length > 0;
}

/** Soft-cancel the caller's own attendance (R14). Returns its PRIOR status, or null if none/terminal. */
export async function cancelOwn(db: Db, eventId: string, userId: string, now: number): Promise<string | null> {
  // Read the live status first (serialized writes make the subsequent UPDATE safe), so the caller
  // can decide whether a confirmed seat freed → open-mode promotion.
  const cur = await db
    .select({ status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.eventId, eventId), eq(attendance.userId, userId)))
    .limit(1);
  const prior = cur[0]?.status;
  if (!prior || prior === "cancelled" || prior === "declined") return null;
  await db
    .update(attendance)
    .set({ status: "cancelled", updatedAt: new Date(now) })
    .where(and(eq(attendance.eventId, eventId), eq(attendance.userId, userId)));
  return prior;
}

/**
 * Open-mode promotion (R4): promote the earliest-requested waitlisted attendee THAT STILL FITS to
 * confirmed, in one guarded statement. Returns the promoted user's id (to notify), or null.
 */
export async function promoteEarliestThatFits(
  db: Db,
  eventId: string,
  capacity: number | null,
  now: number,
): Promise<string | null> {
  const fits = sql`(${capacity} is null or (${CONFIRMED_SUM(eventId)} + party_size) <= ${capacity})`;
  const rows = await db.all<{ user_id: string }>(sql`
    update attendance set status = 'confirmed', updated_at = ${now}
    where id = (
      select id from attendance
      where event_id = ${eventId} and status = 'waitlisted' and ${fits}
      order by requested_at, id limit 1
    )
    returning user_id
  `);
  return rows[0]?.user_id ?? null;
}

/**
 * Change a CONFIRMED party's size with the fit guard: increasing is rejected when it no longer fits
 * (never demotes). Returns 'ok' on update, 'full' when it would exceed capacity, 'missing' when the
 * row isn't confirmed. (Waitlisted/pending resizes are handled by {@link resizeNonConfirmed}.)
 */
export async function resizeConfirmed(
  db: Db,
  eventId: string,
  userId: string,
  newSize: number,
  capacity: number | null,
  now: number,
): Promise<"ok" | "full" | "missing"> {
  // confirmed_sum includes this row's current party_size, so subtract it before adding newSize.
  const fits = sql`(${capacity} is null or (${CONFIRMED_SUM(eventId)} - party_size + ${newSize}) <= ${capacity})`;
  const rows = await db.all<{ id: string }>(sql`
    update attendance set party_size = ${newSize}, updated_at = ${now}
    where event_id = ${eventId} and user_id = ${userId} and status = 'confirmed' and ${fits}
    returning id
  `);
  if (rows.length > 0) return "ok";
  // 0 rows → either not confirmed, or the guard rejected it. Disambiguate with a cheap read.
  const cur = await db
    .select({ status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.eventId, eventId), eq(attendance.userId, userId)))
    .limit(1);
  return cur[0]?.status === "confirmed" ? "full" : "missing";
}

/** Resize a waitlisted/pending party (no capacity math). Returns true if such a row was updated. */
export async function resizeNonConfirmed(
  db: Db,
  eventId: string,
  userId: string,
  newSize: number,
  now: number,
): Promise<boolean> {
  const rows = await db.all<{ id: string }>(sql`
    update attendance set party_size = ${newSize}, updated_at = ${now}
    where event_id = ${eventId} and user_id = ${userId} and status in ('waitlisted','pending')
    returning id
  `);
  return rows.length > 0;
}

/** One attendance row by id within an event (approve/decline disambiguation). */
export async function attendanceById(db: Db, eventId: string, attendanceId: string) {
  const rows = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.id, attendanceId), eq(attendance.eventId, eventId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Pending requests for an event (host queue), earliest-first, with the requester's public profile. */
export async function pendingRequestsForEvent(db: Db, eventId: string) {
  return db
    .select({
      attendanceId: attendance.id,
      userId: attendance.userId,
      partySize: attendance.partySize,
      requestedAt: attendance.requestedAt,
      status: attendance.status,
      name: user.name,
      image: user.image,
      sharePhone: user.sharePhone,
    })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.eventId, eventId), eq(attendance.status, "pending")))
    .orderBy(asc(attendance.requestedAt), asc(attendance.id));
}
