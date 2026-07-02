import { z } from "zod";

/**
 * Folder name rules (004 D3): trimmed, 1–60 chars. Uniqueness per-user (case-insensitive) is
 * enforced at the DB (a NOCASE unique index) and surfaced as `folder.name_taken` by the service —
 * not expressible here. Reused by create and rename.
 */
export const FolderNameSchema = z
  .string()
  .trim()
  .min(1, "folder.name_required")
  .max(60, "folder.name_too_long");

/** Create-folder request body. */
export const CreateFolderInput = z.object({ name: FolderNameSchema });
export type CreateFolderInputType = z.infer<typeof CreateFolderInput>;

/** Rename-folder request body (same shape as create). */
export const UpdateFolderInput = z.object({ name: FolderNameSchema });
export type UpdateFolderInputType = z.infer<typeof UpdateFolderInput>;

/**
 * Owner-facing folder representation. `stayCount` is the number of the caller's *active* Stays in
 * the folder (computed server-side); the folder list is ordered by `createdAt`. Owner-only — 004
 * introduces no public folder projection (D11).
 */
export interface FolderDTO {
  id: string;
  name: string;
  stayCount: number;
  createdAt: number;
}
