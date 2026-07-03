import { ERROR_CODES, type FolderDTO } from "@minyanim/shared";
import type { Db } from "../db/client";
import { AppError, NotFound } from "../lib/errors";
import {
  listFolders as repoList,
  createFolder as repoCreate,
  getFolderById as repoGet,
  renameFolder as repoRename,
  setFolderPinned as repoSetPinned,
  deleteFolder as repoDelete,
  type FolderRow,
  type FolderWithCount,
} from "../repositories/folderRepository";

/**
 * True when a thrown DB error is a SQLite/D1 UNIQUE-constraint violation. Drizzle wraps the D1
 * error ("Failed query: …") and the underlying "UNIQUE constraint failed" / "D1_ERROR" text lives
 * on `.cause`, so the whole cause chain is inspected.
 */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/UNIQUE constraint failed/i.test(msg)) return true;
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return false;
}

/** Map a stored folder (+count) to the owner DTO. `createdAt` is epoch-ms. */
function toFolderDTO(row: FolderWithCount): FolderDTO {
  return { id: row.id, name: row.name, stayCount: Number(row.stayCount), pinned: row.pinned, createdAt: row.createdAt.getTime() };
}

/** A freshly created/renamed/re-pinned folder has no Stays counted from the write path → 0/refetch. */
function toBareFolderDTO(row: FolderRow, stayCount: number): FolderDTO {
  return { id: row.id, name: row.name, stayCount, pinned: row.pinned, createdAt: row.createdAt.getTime() };
}

/** List the caller's folders (oldest-first) with active-Stay counts. */
export async function listFolders(db: Db, userId: string): Promise<FolderDTO[]> {
  const rows = await repoList(db, userId);
  return rows.map(toFolderDTO);
}

/**
 * Create a folder. The name is already trimmed/length-validated by the Zod input; per-user
 * case-insensitive uniqueness is DB-enforced (NOCASE index) — an empty insert result means the
 * name is taken (R2). New folders have zero Stays.
 */
export async function createFolder(db: Db, userId: string, name: string): Promise<FolderDTO> {
  const now = new Date();
  const row = await repoCreate(db, {
    id: `fld_${crypto.randomUUID()}`,
    userId,
    name,
    createdAt: now,
    updatedAt: now,
  });
  if (!row) throw new AppError(400, ERROR_CODES.FOLDER_NAME_TAKEN, "name");
  return toBareFolderDTO(row, 0);
}

/**
 * Rename an owned folder. 404 if not owned; `folder.name_taken` if the new name collides with
 * another of the caller's folders (caught from the NOCASE unique index — an UPDATE can't use
 * `onConflictDoNothing`). The stayCount is unaffected; refetched via the list on the client.
 */
export async function renameFolder(
  db: Db,
  userId: string,
  id: string,
  name: string,
): Promise<FolderDTO> {
  const existing = await repoGet(db, userId, id);
  if (!existing) throw NotFound();
  let row: FolderRow | null;
  try {
    row = await repoRename(db, userId, id, name);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(400, ERROR_CODES.FOLDER_NAME_TAKEN, "name");
    throw err;
  }
  if (!row) throw NotFound();
  return toBareFolderDTO(row, 0);
}

/** Pin/unpin an owned folder (controls whether it appears as a dashboard quick-filter chip). */
export async function setFolderPinned(db: Db, userId: string, id: string, pinned: boolean): Promise<FolderDTO> {
  const row = await repoSetPinned(db, userId, id, pinned);
  if (!row) throw NotFound();
  return toBareFolderDTO(row, 0);
}

/**
 * Delete an owned folder. Confirm-guarded (the frontend shows the reassign warning). A single
 * DELETE — the `stay.folder_id` FK `ON DELETE SET NULL` reassigns its Stays to Unfiled, no
 * app-side loop (D4). 404 if not owned.
 */
export async function deleteFolder(
  db: Db,
  userId: string,
  id: string,
  confirm: boolean,
): Promise<void> {
  if (confirm !== true) throw new AppError(400, ERROR_CODES.CONFIRM_REQUIRED, "confirm");
  const ok = await repoDelete(db, userId, id);
  if (!ok) throw NotFound();
}

/**
 * Assert the caller owns `folderId` (used by stay create/update before assigning). Throws
 * `NotFound` if the folder doesn't exist or belongs to someone else — never leaking existence
 * (R7/D6). The FK alone is insufficient: a foreign folder row exists, so the FK would pass.
 */
export async function assertFolderOwned(db: Db, userId: string, folderId: string): Promise<void> {
  const row = await repoGet(db, userId, folderId);
  if (!row) throw NotFound();
}
