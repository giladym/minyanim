import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModerationQueueEntryDTO, ModeratedContentType, UserStatus } from "@minyanim/shared";
import { api } from "./api";

export const MODERATION_QUEUE_KEY = ["admin", "moderation"] as const;

/** The moderation queue — flagged/hidden content, auto-hidden first (006 US3). Admin-only. */
export function useModerationQueue() {
  return useQuery({
    queryKey: MODERATION_QUEUE_KEY,
    queryFn: () => api<{ entries: ModerationQueueEntryDTO[] }>("/admin/moderation"),
    retry: false,
  });
}

/** Dismiss (restore + clear flags) or remove (hide) a flagged content item. */
export function useContentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contentType, contentId, action }: { contentType: ModeratedContentType; contentId: string; action: "dismiss" | "remove" }) =>
      api(`/admin/moderation/${contentType}/${contentId}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MODERATION_QUEUE_KEY }),
  });
}

export type SanctionAction = "warn" | "suspend" | "ban" | "reinstate";

/** Sanction the owner of flagged content (warn/suspend/ban/reinstate). Refreshes the queue after. */
export function useSanctionUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, action, suspendDays }: { userId: string; action: SanctionAction; suspendDays?: number }) =>
      api<{ ok: true; status: UserStatus; suspendedUntil: number | null }>(`/admin/users/${userId}/${action}`, {
        method: "POST",
        body: JSON.stringify(suspendDays != null ? { suspendDays } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MODERATION_QUEUE_KEY }),
  });
}
