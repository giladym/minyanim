import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notification, notificationEventLog, commitment, user, event } from "../db/schema";
import type { NotificationKind } from "@minyanim/shared";

/** A fan-out recipient: who to notify + how to localize their email. */
export interface Recipient {
  userId: string;
  email: string;
  language: string;
}

/** Committed participants of an event (the host is among them via self-commit). */
export async function recipientsForEvent(db: Db, eventId: string): Promise<Recipient[]> {
  return db
    .select({ userId: commitment.userId, email: user.email, language: user.language })
    .from(commitment)
    .innerJoin(user, eq(user.id, commitment.userId))
    .where(eq(commitment.eventId, eventId));
}

/** Public context for the notification (city/country + the event date + host) — no private fields. */
export async function eventNotifyContext(db: Db, eventId: string) {
  const rows = await db
    .select({ city: event.city, country: event.country, eventDate: event.eventDate, hostUserId: event.hostUserId })
    .from(event)
    .where(eq(event.id, eventId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Claim a threshold crossing: insert the idempotency-log row; returns true only if it was NEWLY
 * inserted (so the fan-out fires exactly once per crossing, R8). `onConflictDoNothing().returning()`
 * yields [] when the row already exists.
 */
export async function claimCrossing(db: Db, eventId: string, kind: NotificationKind, threshold: number | null): Promise<boolean> {
  const rows = await db
    .insert(notificationEventLog)
    .values({ id: `nel_${crypto.randomUUID()}`, eventId, kind, threshold, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: notificationEventLog.id });
  return rows.length > 0;
}

/** Clear a crossing-log row (on a downward crossing); returns true if one existed. */
export async function clearCrossing(db: Db, eventId: string, kind: NotificationKind, threshold: number | null): Promise<boolean> {
  const rows = await db
    .delete(notificationEventLog)
    .where(
      and(
        eq(notificationEventLog.eventId, eventId),
        eq(notificationEventLog.kind, kind),
        threshold === null ? sql`${notificationEventLog.threshold} IS NULL` : eq(notificationEventLog.threshold, threshold),
      ),
    )
    .returning({ id: notificationEventLog.id });
  return rows.length > 0;
}

/** Insert in-app notification rows (the source of truth; email is best-effort, deferred). */
export async function insertNotifications(db: Db, eventId: string, kind: NotificationKind, recipientUserIds: string[]): Promise<void> {
  if (recipientUserIds.length === 0) return;
  const now = new Date();
  await db.insert(notification).values(
    recipientUserIds.map((recipientUserId) => ({
      id: `ntf_${crypto.randomUUID()}`,
      recipientUserId,
      eventId,
      kind,
      read: false,
      createdAt: now,
    })),
  );
}

/** A recipient's inbox, newest-first, with public event context for rendering. */
export async function listNotifications(db: Db, userId: string, unreadOnly: boolean) {
  const conds = [eq(notification.recipientUserId, userId)];
  if (unreadOnly) conds.push(eq(notification.read, false));
  return db
    .select({
      id: notification.id,
      eventId: notification.eventId,
      kind: notification.kind,
      read: notification.read,
      createdAt: notification.createdAt,
      city: event.city,
      country: event.country,
      eventDate: event.eventDate,
    })
    .from(notification)
    .innerJoin(event, eq(event.id, notification.eventId))
    .where(and(...conds))
    .orderBy(desc(notification.createdAt));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(notification)
    .where(and(eq(notification.recipientUserId, userId), eq(notification.read, false)));
  return Number(rows[0]?.n ?? 0);
}

export async function markRead(db: Db, userId: string, id: string): Promise<void> {
  await db.update(notification).set({ read: true }).where(and(eq(notification.id, id), eq(notification.recipientUserId, userId)));
}

export async function markAllRead(db: Db, userId: string): Promise<void> {
  await db.update(notification).set({ read: true }).where(eq(notification.recipientUserId, userId));
}
