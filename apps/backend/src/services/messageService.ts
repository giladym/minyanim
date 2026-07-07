import type { ConversationDTO, MessageDTO, SendMessageInput, ThreadDTO } from "@minyanim/shared";
import { ERROR_CODES } from "@minyanim/shared";
import type { Db } from "../db/client";
import { AppError, NotFound, RateLimited } from "../lib/errors";
import { findUser } from "../repositories/userRepository";
import {
  countSentSince,
  insertMessage,
  listThread,
  listUserMessages,
  markThreadRead,
  unreadCount,
} from "../repositories/messageRepository";

// Per-sender rate limit: at most RATE_MAX messages in RATE_WINDOW_MS. Cheap abuse guard on top of
// the recipient's accept-messages opt-out (any signed-in user may message any other).
const RATE_MAX = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Send a direct message. Guards: recipient exists, not yourself, recipient accepts messages, and
 * the sender is under the rate limit. Returns the created message from the sender's perspective.
 */
export async function sendMessage(db: Db, senderId: string, input: SendMessageInput): Promise<MessageDTO> {
  if (input.recipientUserId === senderId) throw new AppError(400, ERROR_CODES.MESSAGE_SELF);

  const recipient = await findUser(db, input.recipientUserId);
  if (!recipient) throw NotFound();
  if (!recipient.acceptMessages) throw new AppError(403, ERROR_CODES.MESSAGE_OPTED_OUT);

  const recent = await countSentSince(db, senderId, new Date(Date.now() - RATE_WINDOW_MS));
  if (recent >= RATE_MAX) throw RateLimited();

  const row = await insertMessage(db, {
    senderUserId: senderId,
    recipientUserId: input.recipientUserId,
    body: input.body,
  });
  return { id: row.id, body: row.body, mine: true, read: row.read, createdAt: row.createdAt.getTime() };
}

/** The viewer's inbox: one preview row per conversation (other party), newest activity first. */
export async function getConversations(db: Db, userId: string): Promise<ConversationDTO[]> {
  const rows = await listUserMessages(db, userId);
  // rows are newest-first; the first time we see an "other party" is that conversation's latest msg.
  const byOther = new Map<string, ConversationDTO>();
  // Names: a row carries the SENDER's name. For messages the viewer sent, the other party's name
  // isn't on the row — fill it from any inbound row in the same conversation (there usually is one;
  // otherwise fall back to the id, resolved lazily below).
  const missingName = new Set<string>();
  for (const r of rows) {
    const otherId = r.senderUserId === userId ? r.recipientUserId : r.senderUserId;
    const inbound = r.recipientUserId === userId;
    let convo = byOther.get(otherId);
    if (!convo) {
      convo = {
        userId: otherId,
        name: inbound ? r.senderName : "",
        lastBody: r.body,
        lastAt: r.createdAt.getTime(),
        unread: 0,
      };
      byOther.set(otherId, convo);
    }
    if (!convo.name && inbound) convo.name = r.senderName;
    if (inbound && !r.read) convo.unread += 1;
    if (!convo.name) missingName.add(otherId);
  }
  // Resolve names for conversations where the viewer only ever sent (no inbound row to borrow from).
  for (const otherId of missingName) {
    const convo = byOther.get(otherId);
    if (convo && !convo.name) {
      const u = await findUser(db, otherId);
      convo.name = u?.name ?? "";
    }
  }
  return [...byOther.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/** A single thread with `otherId`, marking the viewer's received messages read as a side effect. */
export async function getThread(db: Db, userId: string, otherId: string): Promise<ThreadDTO> {
  const other = await findUser(db, otherId);
  if (!other) throw NotFound();
  await markThreadRead(db, userId, otherId);
  const rows = await listThread(db, userId, otherId);
  const messages: MessageDTO[] = rows.map((r) => ({
    id: r.id,
    body: r.body,
    mine: r.senderUserId === userId,
    read: r.read,
    createdAt: r.createdAt.getTime(),
  }));
  return { userId: otherId, name: other.name, messages };
}

export function getUnreadCount(db: Db, userId: string): Promise<number> {
  return unreadCount(db, userId);
}
