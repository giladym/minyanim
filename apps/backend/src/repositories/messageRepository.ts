import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { message, user } from "../db/schema";

export interface MessageRow {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

/** Insert a message and return the stored row. */
export async function insertMessage(
  db: Db,
  values: { senderUserId: string; recipientUserId: string; body: string },
): Promise<MessageRow> {
  const row = {
    id: crypto.randomUUID(),
    senderUserId: values.senderUserId,
    recipientUserId: values.recipientUserId,
    body: values.body,
    read: false,
    createdAt: new Date(),
  };
  await db.insert(message).values(row);
  return row;
}

/** Every message the user is party to (either direction), newest-first, with the OTHER party's id
 * + name. The service reduces these into per-conversation previews. Capped to keep it bounded. */
export async function listUserMessages(db: Db, userId: string, limit = 500) {
  const sender = user;
  return db
    .select({
      id: message.id,
      senderUserId: message.senderUserId,
      recipientUserId: message.recipientUserId,
      body: message.body,
      read: message.read,
      createdAt: message.createdAt,
      senderName: sender.name,
      senderImage: sender.image,
    })
    .from(message)
    .innerJoin(sender, eq(sender.id, message.senderUserId))
    .where(or(eq(message.senderUserId, userId), eq(message.recipientUserId, userId)))
    .orderBy(desc(message.createdAt))
    .limit(limit);
}

/** All messages between the viewer and one other user, oldest-first (thread reading order). */
export async function listThread(db: Db, userId: string, otherId: string) {
  return db
    .select({
      id: message.id,
      senderUserId: message.senderUserId,
      body: message.body,
      read: message.read,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(
      or(
        and(eq(message.senderUserId, userId), eq(message.recipientUserId, otherId)),
        and(eq(message.senderUserId, otherId), eq(message.recipientUserId, userId)),
      ),
    )
    .orderBy(message.createdAt);
}

/** Mark all messages the viewer RECEIVED from `otherId` as read. */
export async function markThreadRead(db: Db, userId: string, otherId: string): Promise<void> {
  await db
    .update(message)
    .set({ read: true })
    .where(and(eq(message.recipientUserId, userId), eq(message.senderUserId, otherId), eq(message.read, false)));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(message)
    .where(and(eq(message.recipientUserId, userId), eq(message.read, false)));
  return Number(rows[0]?.n ?? 0);
}

/** How many messages `senderId` has sent since `since` — for the per-sender rate limit. */
export async function countSentSince(db: Db, senderId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(message)
    .where(and(eq(message.senderUserId, senderId), gt(message.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}
