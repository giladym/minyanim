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

/**
 * Update-folder request body: rename (`name`) and/or pin/unpin (`pinned`). Both optional so a
 * request can do either; the service applies whichever is present. Pinned folders are the ones
 * surfaced as quick-filter chips on the dashboard (unpinned stay reachable via "manage folders"),
 * keeping the filter row usable across years of trips (004 amendment).
 */
export const UpdateFolderInput = z.object({
  name: FolderNameSchema.optional(),
  pinned: z.boolean().optional(),
});
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
  /** Whether the folder is shown as a quick-filter chip on the dashboard (default true). */
  pinned: boolean;
  createdAt: number;
}
