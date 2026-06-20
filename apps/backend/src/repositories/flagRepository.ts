import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { flag, event } from "../db/schema";

/** Whether an event exists (flagging a missing one is a 404, not an FK error). */
export async function eventExists(db: Db, eventId: string): Promise<boolean> {
  const rows = await db.select({ id: event.id }).from(event).where(eq(event.id, eventId)).limit(1);
  return rows.length > 0;
}

/**
 * Record a flag on an event. Idempotent via `UNIQUE(event_id, user_id)` — a repeat flag by the same
 * user is a no-op (D19). The 3-flag auto-hide threshold + moderation are Feature 006; 003 only
 * stores flags and honours `event.hidden` in discovery.
 */
export async function flagEvent(db: Db, eventId: string, userId: string): Promise<void> {
  await db
    .insert(flag)
    .values({ id: `flg_${crypto.randomUUID()}`, eventId, userId, createdAt: new Date() })
    .onConflictDoNothing();
}
