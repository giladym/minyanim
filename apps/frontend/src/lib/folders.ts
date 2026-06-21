import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FolderDTO } from "@minyanim/shared";
import { STAYS_KEY } from "./stays";
import { api } from "./api";

/** Query key for the caller's folder list. */
export const FOLDERS_KEY = ["folders"] as const;

/** GET /api/folders — the caller's folders (oldest-first) with active-Stay counts. */
export const listFolders = () =>
  api<{ folders: FolderDTO[] }>("/folders").then((r) => r.folders);

/** POST /api/folders — create a folder (returns it; `folder.name_taken` on a ci duplicate). */
export const createFolder = (name: string) =>
  api<FolderDTO>("/folders", { method: "POST", body: JSON.stringify({ name }) });

/** PATCH /api/folders/{id} — rename a folder. */
export const renameFolder = (id: string, name: string) =>
  api<FolderDTO>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

/** DELETE /api/folders/{id} — delete (confirm-guarded); its Stays cascade to Unfiled. */
export const deleteFolder = (id: string) =>
  api<{ ok: true }>(`/folders/${id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });

/** TanStack Query hook for the folder list. */
export function useFolders() {
  return useQuery({ queryKey: FOLDERS_KEY, queryFn: listFolders });
}

/** Invalidate both folders and the active-stays cache (folder edits change grouping + counts). */
function invalidateFoldersAndStays(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: FOLDERS_KEY });
  void qc.invalidateQueries({ queryKey: STAYS_KEY });
}

/** Create-folder mutation. */
export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createFolder,
    onSettled: () => invalidateFoldersAndStays(qc),
  });
}

/** Rename-folder mutation. */
export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSettled: () => invalidateFoldersAndStays(qc),
  });
}

/** Delete-folder mutation. The deleted folder's Stays move to Unfiled (FK SET NULL) — invalidate
 * both caches so counts and grouping refresh. */
export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFolder,
    onSettled: () => invalidateFoldersAndStays(qc),
  });
}
