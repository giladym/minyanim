import { eq } from "drizzle-orm";
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
