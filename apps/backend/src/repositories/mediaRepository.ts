import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { user, stay, event, place } from "../db/schema";
import type { ImageKind } from "@minyanim/shared";

/** Owner + moderation state of the parent an image belongs to (null if the parent is missing). */
export interface ParentState {
  ownerId: string | null; // stay.userId / event.hostUserId / the user themselves; null for place (admin-only)
  hidden: boolean; // moderation hidden flag (stay/event); false for avatar/place
}

/** Read the parent's owner + hidden flag for authorization/visibility. `avatar`'s owner is the id itself. */
export async function parentState(db: Db, kind: ImageKind, parentId: string): Promise<ParentState | null> {
  if (kind === "avatar") {
    const r = await db.select({ id: user.id }).from(user).where(eq(user.id, parentId)).limit(1);
    return r[0] ? { ownerId: parentId, hidden: false } : null;
  }
  if (kind === "stay") {
    const r = await db.select({ owner: stay.userId, hidden: stay.hidden }).from(stay).where(eq(stay.id, parentId)).limit(1);
    return r[0] ? { ownerId: r[0].owner, hidden: r[0].hidden } : null;
  }
  if (kind === "event") {
    const r = await db.select({ owner: event.hostUserId, hidden: event.hidden }).from(event).where(eq(event.id, parentId)).limit(1);
    return r[0] ? { ownerId: r[0].owner, hidden: r[0].hidden } : null;
  }
  // place — admin-managed, no per-user owner.
  const r = await db.select({ id: place.id }).from(place).where(eq(place.id, parentId)).limit(1);
  return r[0] ? { ownerId: null, hidden: false } : null;
}

/** Whether a user is an admin (for authorize/visibility fallbacks). */
export async function isAdmin(db: Db, userId: string): Promise<boolean> {
  const r = await db.select({ a: user.isAdmin }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(r[0]?.a);
}

/** Current image refs for a gallery parent (empty if none). Not used for avatar (single ref). */
export async function getImages(db: Db, kind: "stay" | "event" | "place", parentId: string): Promise<string[]> {
  if (kind === "stay") return (await db.select({ i: stay.images }).from(stay).where(eq(stay.id, parentId)).limit(1))[0]?.i ?? [];
  if (kind === "event") return (await db.select({ i: event.images }).from(event).where(eq(event.id, parentId)).limit(1))[0]?.i ?? [];
  return (await db.select({ i: place.images }).from(place).where(eq(place.id, parentId)).limit(1))[0]?.i ?? [];
}

/** Overwrite a gallery parent's image refs. */
export async function setImages(db: Db, kind: "stay" | "event" | "place", parentId: string, refs: string[]): Promise<void> {
  if (kind === "stay") await db.update(stay).set({ images: refs, updatedAt: new Date() }).where(eq(stay.id, parentId));
  else if (kind === "event") await db.update(event).set({ images: refs, updatedAt: new Date() }).where(eq(event.id, parentId));
  else await db.update(place).set({ images: refs, updatedAt: new Date() }).where(eq(place.id, parentId));
}

/** Read / set the single avatar ref (user.image). */
export async function getAvatar(db: Db, userId: string): Promise<string | null> {
  return (await db.select({ img: user.image }).from(user).where(eq(user.id, userId)).limit(1))[0]?.img ?? null;
}
export async function setAvatar(db: Db, userId: string, ref: string | null): Promise<void> {
  await db.update(user).set({ image: ref, updatedAt: new Date() }).where(eq(user.id, userId));
}
