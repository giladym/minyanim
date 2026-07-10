import { z } from "zod";

/** Send a direct in-app message to another user. */
export const sendMessageSchema = z.object({
  recipientUserId: z.string().min(1, "message.recipient_required"),
  body: z.string().trim().min(1, "message.body_required").max(2000, "message.body_too_long"),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** A single message within a thread, from the viewer's perspective. */
export interface MessageDTO {
  id: string;
  body: string;
  /** True when the viewer sent this message (drives left/right bubble alignment). */
  mine: boolean;
  read: boolean;
  createdAt: number;
}

/** One conversation in the inbox — the other participant + a preview of the latest message. */
export interface ConversationDTO {
  /** The other participant's user id. */
  userId: string;
  name: string;
  /** The other participant's avatar ref (012); null = initials placeholder. */
  image: string | null;
  lastBody: string;
  lastAt: number;
  /** Unread messages the viewer has received in this conversation. */
  unread: number;
}

/** GET /api/messages/:userId — a single thread + the other participant's display name + avatar. */
export interface ThreadDTO {
  userId: string;
  name: string;
  image: string | null;
  messages: MessageDTO[];
}
