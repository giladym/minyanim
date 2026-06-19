import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { stay } from "../db/schema";

/** A stay row as stored (Drizzle handles the JSON + timestamp + boolean round-trips). */
export type StayRow = typeof stay.$inferSelect;
/** Fields accepted on insert. */
export type StayInsert = typeof stay.$inferInsert;

/** Insert a new stay and return the stored row. */
export async function createStay(db: Db, values: StayInsert): Promise<StayRow> {
  const rows = await db.insert(stay).values(values).returning();
  return rows[0]!;
}

/** Fetch one stay owned by the user, or null if missing / not owned. */
export async function getStayById(db: Db, userId: string, id: string): Promise<StayRow | null> {
  const rows = await db
    .select()
    .from(stay)
    .where(and(eq(stay.id, id), eq(stay.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** List the user's active stays, nearest-first (arrival_date ASC). Cancelled rows excluded. */
export async function listStays(db: Db, userId: string): Promise<StayRow[]> {
  return db
    .select()
    .from(stay)
    .where(and(eq(stay.userId, userId), eq(stay.status, "active")))
    .orderBy(asc(stay.arrivalDate));
}

/**
 * Partially update an owned stay; returns the updated row, or null if not owned.
 * `updated_at` is bumped by the caller (service) via the passed fields.
 */
export async function updateStay(
  db: Db,
  userId: string,
  id: string,
  fields: Partial<StayInsert>,
): Promise<StayRow | null> {
  const rows = await db
    .update(stay)
    .set(fields)
    .where(and(eq(stay.id, id), eq(stay.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

/** Soft-cancel an owned stay (status → 'cancelled'); returns true if a row was affected. */
export async function cancelStay(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(stay)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(stay.id, id), eq(stay.userId, userId)))
    .returning({ id: stay.id });
  return rows.length > 0;
}
