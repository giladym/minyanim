import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { folder, stay } from "../db/schema";

/** A folder row as stored. */
export type FolderRow = typeof folder.$inferSelect;
/** Fields accepted on insert. */
export type FolderInsert = typeof folder.$inferInsert;

/** A folder plus its active-Stay count (the list projection). */
export type FolderWithCount = FolderRow & { stayCount: number };

/**
 * List the user's folders, oldest-first (D3), each with a count of that user's *active*
 * (non-cancelled) Stays in it. LEFT JOIN so empty folders report `stayCount: 0`.
 */
export async function listFolders(db: Db, userId: string): Promise<FolderWithCount[]> {
  const rows = await db
    .select({
      id: folder.id,
      userId: folder.userId,
      name: folder.name,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      stayCount: sql<number>`count(case when ${stay.status} = 'active' then 1 end)`,
    })
    .from(folder)
    .leftJoin(stay, eq(stay.folderId, folder.id))
    .where(eq(folder.userId, userId))
    .groupBy(folder.id)
    .orderBy(asc(folder.createdAt));
  return rows;
}

/**
 * Insert a folder. Returns the stored row, or `null` when the per-user NOCASE name unique index
 * rejects it (bare `onConflictDoNothing` — the COLLATE index isn't in Drizzle's schema so it can't
 * be named as a target; an empty `returning()` means the name is taken). (R2)
 */
export async function createFolder(db: Db, values: FolderInsert): Promise<FolderRow | null> {
  const rows = await db.insert(folder).values(values).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

/** Fetch one folder owned by the user, or null. */
export async function getFolderById(db: Db, userId: string, id: string): Promise<FolderRow | null> {
  const rows = await db
    .select()
    .from(folder)
    .where(and(eq(folder.id, id), eq(folder.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Rename an owned folder. Returns the updated row; `null` if not owned. Throws (via the conflict)
 * is not possible here — the caller pre-checks ownership and maps the unique violation. We use a
 * guarded update + a follow-up read of the conflict via `returning()`.
 */
export async function renameFolder(
  db: Db,
  userId: string,
  id: string,
  name: string,
): Promise<FolderRow | null> {
  const rows = await db
    .update(folder)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(folder.id, id), eq(folder.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

/** Delete an owned folder (its Stays cascade to Unfiled via FK SET NULL). True if a row went. */
export async function deleteFolder(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(folder)
    .where(and(eq(folder.id, id), eq(folder.userId, userId)))
    .returning({ id: folder.id });
  return rows.length > 0;
}
