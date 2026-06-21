import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { stay } from "../db/schema";

/** Keyset cursor for History pagination: the last row's (departure_date epoch-ms, id). */
export type HistoryCursor = { departureMs: number; id: string };

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
 * Coarse keyset page for History (004 R4/R5). Inclusively matches rows that COULD be history —
 * `status='cancelled'` OR `departure_date` before `boundary` (today_utc + 1 day, a buffer so the
 * in-service tz-aware `isPast` refine never excludes a row this SQL dropped). Ordered
 * `(departure_date DESC, id DESC)` over `stay_user_departure_idx`; `cursor` (if given) returns only
 * rows strictly after it. The caller over-fetches, refines by `historyTag`, and re-derives the
 * cursor from the last KEPT row.
 */
export async function listStaysForHistory(
  db: Db,
  userId: string,
  boundary: Date,
  cursor: HistoryCursor | null,
  limit: number,
): Promise<StayRow[]> {
  const coarse = or(eq(stay.status, "cancelled"), lt(stay.departureDate, boundary));
  const conds = [eq(stay.userId, userId), coarse];
  if (cursor) {
    const cDate = new Date(cursor.departureMs);
    conds.push(
      or(
        lt(stay.departureDate, cDate),
        and(eq(stay.departureDate, cDate), lt(stay.id, cursor.id)),
      )!,
    );
  }
  return db
    .select()
    .from(stay)
    .where(and(...conds))
    .orderBy(desc(stay.departureDate), desc(stay.id))
    .limit(limit);
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

/** Hard-delete an owned stay (004 D8). Returns true if a row was removed. Linked
 * `commitment.stay_id` rows are SET NULL via the FK. */
export async function hardDeleteStay(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(stay)
    .where(and(eq(stay.id, id), eq(stay.userId, userId)))
    .returning({ id: stay.id });
  return rows.length > 0;
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
