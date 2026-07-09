import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { flag, event, stay } from "../db/schema";
import type { FlagReason, ModeratedContentType } from "@minyanim/shared";

/** Whether the flagged content exists (flagging a missing item is a 404, not an FK error — the
 * polymorphic content_id has no DB FK, so we check the right table by type). */
export async function contentExists(db: Db, contentType: ModeratedContentType, contentId: string): Promise<boolean> {
  if (contentType === "event") {
    return (await db.select({ id: event.id }).from(event).where(eq(event.id, contentId)).limit(1)).length > 0;
  }
  return (await db.select({ id: stay.id }).from(stay).where(eq(stay.id, contentId)).limit(1)).length > 0;
}

/** Record a flag. Idempotent via UNIQUE(content_type, content_id, user_id) — a repeat by the same
 * reporter is a no-op (FR-001). */
export async function insertFlag(
  db: Db,
  v: { contentType: ModeratedContentType; contentId: string; userId: string; reason: FlagReason; reportedUserId: string | null },
): Promise<void> {
  await db
    .insert(flag)
    .values({ id: `flg_${crypto.randomUUID()}`, ...v, createdAt: new Date() })
    .onConflictDoNothing();
}

/** Distinct reporters of a content item — drives the auto-hide threshold (the unique index means
 * one row per reporter, so this is COUNT(*) over the pair). */
export async function distinctReporterCount(db: Db, contentType: ModeratedContentType, contentId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(flag)
    .where(and(eq(flag.contentType, contentType), eq(flag.contentId, contentId)));
  return Number(rows[0]?.n ?? 0);
}

/** Set the content's `hidden` flag (idempotent — writing the same value is a no-op). */
export async function setContentHidden(db: Db, contentType: ModeratedContentType, contentId: string, hidden: boolean): Promise<void> {
  if (contentType === "event") {
    await db.update(event).set({ hidden, updatedAt: new Date() }).where(eq(event.id, contentId));
  } else {
    await db.update(stay).set({ hidden, updatedAt: new Date() }).where(eq(stay.id, contentId));
  }
}

/** Clear all flags on a content item (on dismiss/restore). */
export async function clearFlags(db: Db, contentType: ModeratedContentType, contentId: string): Promise<void> {
  await db.delete(flag).where(and(eq(flag.contentType, contentType), eq(flag.contentId, contentId)));
}

/** The owner (sanction target) of a content item — stay.userId / event.hostUserId; null if missing. */
export async function getContentOwnerId(db: Db, contentType: ModeratedContentType, contentId: string): Promise<string | null> {
  if (contentType === "event") {
    const r = await db.select({ owner: event.hostUserId }).from(event).where(eq(event.id, contentId)).limit(1);
    return r[0]?.owner ?? null;
  }
  const r = await db.select({ owner: stay.userId }).from(stay).where(eq(stay.id, contentId)).limit(1);
  return r[0]?.owner ?? null;
}
