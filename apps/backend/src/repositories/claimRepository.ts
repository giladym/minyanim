import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { user, phoneNumber, stay, event, attendance, eventRole } from "../db/schema";

/** Run a `count(*)` select and return the number (0 when empty). */
async function countRows(q: Promise<{ n: number }[]>): Promise<number> {
  const rows = await q;
  return Number(rows[0]?.n ?? 0);
}

/** The signed-in user's phone numbers (E.164) — the keys we match seed users against. */
async function realUserPhones(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ e164: phoneNumber.e164 }).from(phoneNumber).where(eq(phoneNumber.userId, userId));
  return rows.map((r) => r.e164);
}

export interface ClaimableSeed {
  seedUserId: string;
  name: string;
  phone: string;
  stays: number;
  events: number;
}

/** Seed users (kind='seed') sharing a phone with `userId`, with their trip/minyan counts. */
export async function findClaimableSeeds(db: Db, userId: string): Promise<ClaimableSeed[]> {
  const phones = await realUserPhones(db, userId);
  if (phones.length === 0) return [];

  const matches = await db
    .select({ id: user.id, name: user.name, e164: phoneNumber.e164 })
    .from(user)
    .innerJoin(phoneNumber, eq(phoneNumber.userId, user.id))
    .where(and(eq(user.kind, "seed"), inArray(phoneNumber.e164, phones)));

  // One entry per seed (a seed may match on more than one phone).
  const bySeed = new Map<string, { name: string; phone: string }>();
  for (const m of matches) if (!bySeed.has(m.id)) bySeed.set(m.id, { name: m.name, phone: m.e164 });

  const out: ClaimableSeed[] = [];
  for (const [seedUserId, { name, phone }] of bySeed) {
    const stays = await countRows(db.select({ n: sql<number>`count(*)` }).from(stay).where(eq(stay.userId, seedUserId)));
    const events = await countRows(db.select({ n: sql<number>`count(*)` }).from(event).where(eq(event.hostUserId, seedUserId)));
    out.push({ seedUserId, name, phone, stays, events });
  }
  return out;
}

export interface ClaimResult {
  claimed: number;
  stays: number;
  events: number;
}

/**
 * Merge the given seed users into `realUserId`: reassign their stays/events/commitments/roles, then
 * delete the seed rows. RE-VERIFIES server-side that each id is a seed sharing a phone with the
 * caller — a client can't claim an arbitrary account by id. Returns what was moved.
 */
export async function claimSeeds(db: Db, realUserId: string, seedUserIds: string[]): Promise<ClaimResult> {
  const phones = await realUserPhones(db, realUserId);
  if (phones.length === 0 || seedUserIds.length === 0) return { claimed: 0, stays: 0, events: 0 };

  const verifiedRows = await db
    .selectDistinct({ id: user.id })
    .from(user)
    .innerJoin(phoneNumber, eq(phoneNumber.userId, user.id))
    .where(and(inArray(user.id, seedUserIds), eq(user.kind, "seed"), inArray(phoneNumber.e164, phones)));
  const verified = verifiedRows.map((r) => r.id);
  if (verified.length === 0) return { claimed: 0, stays: 0, events: 0 };

  // Count what we're about to move (for the response / UI).
  const stays = await countRows(db.select({ n: sql<number>`count(*)` }).from(stay).where(inArray(stay.userId, verified)));
  const events = await countRows(db.select({ n: sql<number>`count(*)` }).from(event).where(inArray(event.hostUserId, verified)));

  // Avoid the (event_id, user_id) unique-index clash: if the caller already has an attendance on an
  // event a seed also attended, resolve the clash STATUS-AWARE (keep the CONFIRMED row, not blindly
  // the real user's possibly-cancelled row — validation-report soft-cancel addendum) before
  // reassigning the rest.
  const realAtt = await db.select({ eventId: attendance.eventId, status: attendance.status }).from(attendance).where(eq(attendance.userId, realUserId));
  const realStatusByEvent = new Map(realAtt.map((r) => [r.eventId, r.status]));
  if (realStatusByEvent.size > 0) {
    const seedAtt = await db
      .select({ id: attendance.id, eventId: attendance.eventId, status: attendance.status })
      .from(attendance)
      .where(inArray(attendance.userId, verified));
    const dropSeedRowIds: string[] = [];
    const dropRealEventIds: string[] = [];
    for (const s of seedAtt) {
      const realStatus = realStatusByEvent.get(s.eventId);
      if (realStatus === undefined) continue; // no clash on this event
      // The seed's row wins only when it is confirmed and the real user's row is NOT.
      if (s.status === "confirmed" && realStatus !== "confirmed") dropRealEventIds.push(s.eventId);
      else dropSeedRowIds.push(s.id);
    }
    if (dropSeedRowIds.length > 0) await db.delete(attendance).where(inArray(attendance.id, dropSeedRowIds));
    if (dropRealEventIds.length > 0) {
      await db.delete(attendance).where(and(eq(attendance.userId, realUserId), inArray(attendance.eventId, dropRealEventIds)));
    }
  }

  await db.update(attendance).set({ userId: realUserId }).where(inArray(attendance.userId, verified));
  await db.update(eventRole).set({ userId: realUserId }).where(inArray(eventRole.userId, verified));
  await db.update(stay).set({ userId: realUserId, updatedAt: new Date() }).where(inArray(stay.userId, verified));
  await db.update(event).set({ hostUserId: realUserId, updatedAt: new Date() }).where(inArray(event.hostUserId, verified));
  // Deleting the seed rows cascades away their phones (and anything else still pointing at them).
  await db.delete(user).where(inArray(user.id, verified));

  return { claimed: verified.length, stays, events };
}
