import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLL_DISCOVERY_MS, type NotificationDTO } from "@minyanim/shared";
import { api } from "./api";

export const NOTIF_KEY = ["notifications"] as const;

interface NotifResponse {
  notifications: NotificationDTO[];
  unread: number;
}

export const listNotifications = () => api<NotifResponse>("/notifications");

/** Inbox query — polls so the unread badge + list stay fresh; pauses when the tab is hidden. */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIF_KEY,
    queryFn: listNotifications,
    refetchInterval: POLL_DISCOVERY_MS,
    refetchIntervalInBackground: false,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST", body: "{}" }),
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST", body: "{}" }),
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIF_KEY }),
  });
}
