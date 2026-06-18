import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { user, phoneNumber } from "../db/schema";

/** Data access for the user profile (isolates Drizzle from services). */
export async function findUser(db: Db, id: string) {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateUser(
  db: Db,
  id: string,
  fields: Partial<{ name: string; language: string; theme: string }>,
) {
  await db.update(user).set({ ...fields, updatedAt: new Date() }).where(eq(user.id, id));
}

export async function listPhones(db: Db, userId: string) {
  return db.select().from(phoneNumber).where(eq(phoneNumber.userId, userId));
}

export async function addPhone(db: Db, userId: string, e164: string, label: string | null) {
  const id = crypto.randomUUID();
  await db.insert(phoneNumber).values({ id, userId, e164, label, createdAt: new Date() });
  return { id, e164, label };
}

/** Delete a phone the user owns; returns true if a row was removed. */
export async function deletePhone(db: Db, userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(phoneNumber)
    .where(and(eq(phoneNumber.id, id), eq(phoneNumber.userId, userId)))
    .returning({ id: phoneNumber.id });
  return removed.length > 0;
}
