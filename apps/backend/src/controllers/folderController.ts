import type { FolderDTO } from "@minyanim/shared";
import type { Db } from "../db/client";
import {
  listFolders as svcList,
  createFolder as svcCreate,
  renameFolder as svcRename,
  deleteFolder as svcDelete,
} from "../services/folderService";

/** Folder-DTO builder enforced at the controller boundary (allowlist; mirrors stayController). */
function toFolderResponse(dto: FolderDTO): FolderDTO {
  return { id: dto.id, name: dto.name, stayCount: dto.stayCount, createdAt: dto.createdAt };
}

/** List the caller's folders with active-Stay counts. */
export async function listFoldersController(db: Db, userId: string) {
  const folders = await svcList(db, userId);
  return { folders: folders.map(toFolderResponse) };
}

/** Create a folder (`folder.name_taken` on a per-user case-insensitive duplicate). */
export async function createFolderController(db: Db, userId: string, name: string) {
  return toFolderResponse(await svcCreate(db, userId, name));
}

/** Rename an owned folder (404 if not owned; `folder.name_taken` on collision). */
export async function renameFolderController(db: Db, userId: string, id: string, name: string) {
  return toFolderResponse(await svcRename(db, userId, id, name));
}

/** Delete an owned folder (confirm-guarded; its Stays cascade to Unfiled). */
export async function deleteFolderController(
  db: Db,
  userId: string,
  id: string,
  confirm: boolean,
) {
  await svcDelete(db, userId, id, confirm);
  return { ok: true as const };
}
