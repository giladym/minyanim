import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { commitment, event, eventRole, stay } from "../db/schema";

export type CommitmentRow = typeof commitment.$inferSelect;
export type CommitmentInsert = typeof commitment.$inferInsert;

/**
 * Insert a commitment, returning the row — or `undefined` if the unique (event_id, user_id) guard
 * fires (already committed). This is the atomic compare-and-set for the double-commit race (R6).
 */
export async function insertCommitment(db: Db, values: CommitmentInsert): Promise<CommitmentRow | undefined> {
  const rows = await db.insert(commitment).values(values).onConflictDoNothing().returning();
  return rows[0];
}

/** Update a user's party size on an event; null if they aren't committed. */
export async function updateCommitmentMen(db: Db, eventId: string, userId: string, numMen: number): Promise<CommitmentRow | null> {
  const rows = await db
    .update(commitment)
    .set({ numMen, updatedAt: new Date() })
    .where(and(eq(commitment.eventId, eventId), eq(commitment.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

/** Delete a user's commitment; true if a row was removed. */
export async function deleteCommitment(db: Db, eventId: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(commitment)
    .where(and(eq(commitment.eventId, eventId), eq(commitment.userId, userId)))
    .returning({ id: commitment.id });
  return rows.length > 0;
}

/** Release any roles a user holds on an event (called on withdraw / auto-withdraw, R9). */
export async function deleteRolesForUserEvent(db: Db, eventId: string, userId: string): Promise<void> {
  await db.delete(eventRole).where(and(eq(eventRole.eventId, eventId), eq(eventRole.userId, userId)));
}

/**
 * A user's active commitments to OTHER events on the same date (the same Shabbat/day) — the D14
 * conflict surface. Joins event for the date + status filter.
 */
export async function userCommitmentsOnDate(db: Db, userId: string, eventDate: Date, exceptEventId: string) {
  return db
    .select({ eventId: commitment.eventId })
    .from(commitment)
    .innerJoin(event, eq(event.id, commitment.eventId))
    .where(
      and(
        eq(commitment.userId, userId),
        eq(event.eventDate, eventDate),
        eq(event.status, "forming"),
        ne(commitment.eventId, exceptEventId),
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

/** Commitments linked to a Stay (for D12 reconciliation), with their event's date. */
export async function commitmentsByStay(db: Db, stayId: string) {
  return db
    .select({ id: commitment.id, eventId: commitment.eventId, userId: commitment.userId, eventDate: event.eventDate })
    .from(commitment)
    .innerJoin(event, eq(event.id, commitment.eventId))
    .where(eq(commitment.stayId, stayId));
}

/**
 * Active (non-cancelled) minyanim linked to a Stay via the user's commitments (013 location guard).
 * Includes the host id + status so the caller can tell whether the viewer hosts each one.
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
    .from(commitment)
    .innerJoin(event, eq(event.id, commitment.eventId))
    .where(and(eq(commitment.stayId, stayId), ne(event.status, "cancelled")));
}
