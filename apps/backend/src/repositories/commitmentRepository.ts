import { and, eq, ne, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { attendance, event, eventRole, stay } from "../db/schema";

export type CommitmentRow = typeof attendance.$inferSelect;
export type CommitmentInsert = typeof attendance.$inferInsert;

/** Statuses a live (non-terminal) attendance can hold. Terminal = cancelled/declined (soft, R14). */
const LIVE_STATUSES = ["confirmed", "waitlisted", "pending"] as const;
const TERMINAL_STATUSES = ["cancelled", "declined"] as const;

/**
 * Insert an attendance, or RE-JOIN the soft-terminal `(event_id, user_id)` row (R14) — a guarded
 * upsert. On a fresh insert it returns the row; on a conflict it updates ONLY a cancelled/declined
 * row back to confirmed (and returns it). When the existing row is already live (confirmed/
 * waitlisted/pending) the `setWhere` fails, nothing is updated, and RETURNING is empty → the caller
 * treats that as the double-commit guard (`commitment.duplicate`). This is the minyan `/commit` path
 * (always writes `confirmed`); gatherings use the attendance service's guarded writes.
 */
export async function insertCommitment(db: Db, values: CommitmentInsert): Promise<CommitmentRow | undefined> {
  const rows = await db
    .insert(attendance)
    .values(values)
    .onConflictDoUpdate({
      target: [attendance.eventId, attendance.userId],
      set: {
        partySize: values.partySize,
        status: "confirmed",
        stayId: values.stayId ?? null,
        requestedAt: values.requestedAt,
        updatedAt: values.updatedAt,
      },
      setWhere: inArray(attendance.status, [...TERMINAL_STATUSES]),
    })
    .returning();
  return rows[0];
}

/**
 * Update a user's party size on an event; null if they aren't in a LIVE attendance (SC-005 audit
 * #13 — a soft-cancelled/declined row is never silently resized, and `onQuorumChange` is not fired
 * for it).
 */
export async function updateCommitmentMen(db: Db, eventId: string, userId: string, numMen: number): Promise<CommitmentRow | null> {
  const rows = await db
    .update(attendance)
    .set({ partySize: numMen, updatedAt: new Date() })
    .where(
      and(
        eq(attendance.eventId, eventId),
        eq(attendance.userId, userId),
        inArray(attendance.status, [...LIVE_STATUSES]),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** Soft-cancel a user's attendance (R14): status → 'cancelled'. True if a non-cancelled row changed. */
export async function deleteCommitment(db: Db, eventId: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(attendance)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(eq(attendance.eventId, eventId), eq(attendance.userId, userId), ne(attendance.status, "cancelled")),
    )
    .returning({ id: attendance.id });
  return rows.length > 0;
}

/** Release any roles a user holds on an event (called on withdraw / auto-withdraw, R9). */
export async function deleteRolesForUserEvent(db: Db, eventId: string, userId: string): Promise<void> {
  await db.delete(eventRole).where(and(eq(eventRole.eventId, eventId), eq(eventRole.userId, userId)));
}

/**
 * A user's CONFIRMED attendances to OTHER events on the same date (the D14 conflict surface, SC-005
 * audit #7). Joins event for the date + status filter.
 */
export async function userCommitmentsOnDate(db: Db, userId: string, eventDate: Date, exceptEventId: string) {
  return db
    .select({ eventId: attendance.eventId })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .where(
      and(
        eq(attendance.userId, userId),
        eq(attendance.status, "confirmed"),
        eq(event.eventDate, eventDate),
        eq(event.status, "forming"),
        ne(attendance.eventId, exceptEventId),
      ),
    );
}

/** A Stay's current status + date range, for D12 coverage checks. Null if the Stay is gone. */
export async function getStayCoverage(db: Db, stayId: string) {
  const rows = await db
    .select({ status: stay.status, arrival: stay.arrivalDate, departure: stay.departureDate })
    .from(stay)
    .where(eq(stay.id, stayId))
    .limit(1);
  return rows[0] ?? null;
}

/** CONFIRMED attendances linked to a Stay (for D12 reconciliation), with their event's date. */
export async function commitmentsByStay(db: Db, stayId: string) {
  return db
    .select({ id: attendance.id, eventId: attendance.eventId, userId: attendance.userId, eventDate: event.eventDate })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .where(and(eq(attendance.stayId, stayId), eq(attendance.status, "confirmed")));
}

/** Unlink a Stay from its attendances (013 "keep minyanim, unlink" action): clear their stay_id. */
export async function clearStayLink(db: Db, stayId: string): Promise<void> {
  await db.update(attendance).set({ stayId: null, updatedAt: new Date() }).where(eq(attendance.stayId, stayId));
}

/**
 * Active (non-cancelled) minyanim linked to a Stay via the user's CONFIRMED attendances (013
 * location guard, SC-005 audit #8). Includes the host id + status so the caller can tell whether the
 * viewer hosts each one.
 */
export async function linkedMinyanimForStay(db: Db, stayId: string) {
  return db
    .selectDistinct({
      eventId: event.id,
      city: event.city,
      country: event.country,
      eventDate: event.eventDate,
      hostUserId: event.hostUserId,
      status: event.status,
    })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .where(and(eq(attendance.stayId, stayId), eq(attendance.status, "confirmed"), ne(event.status, "cancelled")));
}
