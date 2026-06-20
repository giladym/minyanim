import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { eventRole } from "../db/schema";
import type { EventRole } from "@minyanim/shared";

/**
 * Claim a role slot. The `UNIQUE(event_id, role)` constraint + `onConflictDoNothing().returning()`
 * make this an atomic compare-and-set: an empty result means the slot is already taken (R5).
 */
export async function claimRole(db: Db, eventId: string, role: EventRole, userId: string): Promise<boolean> {
  const rows = await db
    .insert(eventRole)
    .values({ id: `rol_${crypto.randomUUID()}`, eventId, role, userId, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: eventRole.id });
  return rows.length > 0;
}

/** Release a role the caller holds; true if a row was removed (slot reopens). */
export async function releaseRole(db: Db, eventId: string, role: EventRole, userId: string): Promise<boolean> {
  const rows = await db
    .delete(eventRole)
    .where(and(eq(eventRole.eventId, eventId), eq(eventRole.role, role), eq(eventRole.userId, userId)))
    .returning({ id: eventRole.id });
  return rows.length > 0;
}

/** Which roles the given user holds on an event (for the participant view's `myRoles`). */
export async function userRolesForEvent(db: Db, eventId: string, userId: string): Promise<{ baalTefila: boolean; baalKorei: boolean }> {
  const rows = await db
    .select({ role: eventRole.role })
    .from(eventRole)
    .where(and(eq(eventRole.eventId, eventId), eq(eventRole.userId, userId)));
  return {
    baalTefila: rows.some((r) => r.role === "baal_tefila"),
    baalKorei: rows.some((r) => r.role === "baal_korei"),
  };
}
