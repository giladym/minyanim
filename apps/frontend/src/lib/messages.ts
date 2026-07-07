import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLL_DISCOVERY_MS, type ConversationDTO, type MessageDTO, type SendMessageInput, type ThreadDTO } from "@minyanim/shared";
import { api } from "./api";

export const MESSAGES_KEY = ["messages"] as const;
export const threadKey = (userId: string) => ["messages", "thread", userId] as const;

interface InboxResponse {
  conversations: ConversationDTO[];
  unread: number;
}

export const listConversations = () => api<InboxResponse>("/messages");
export const getThread = (userId: string) => api<ThreadDTO>(`/messages/${userId}`);

/** Inbox query — polls so the unread badge + previews stay fresh; pauses when the tab is hidden. */
export function useConversations() {
  return useQuery({
    queryKey: MESSAGES_KEY,
    queryFn: listConversations,
    refetchInterval: POLL_DISCOVERY_MS,
    refetchIntervalInBackground: false,
  });
}

/** A single conversation thread. Fetching it also marks received messages read server-side. */
export function useThread(userId: string) {
  return useQuery({
    queryKey: threadKey(userId),
    queryFn: () => getThread(userId),
    refetchInterval: POLL_DISCOVERY_MS,
    refetchIntervalInBackground: false,
    enabled: !!userId,
  });
}

export function useSendMessage(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<MessageDTO>("/messages", { method: "POST", body: JSON.stringify({ recipientUserId: userId, body } satisfies SendMessageInput) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: threadKey(userId) });
      void qc.invalidateQueries({ queryKey: MESSAGES_KEY });
    },
  });
}
