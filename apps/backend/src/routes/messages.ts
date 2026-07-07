import { Hono } from "hono";
import { sendMessageSchema } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireUserId } from "../lib/auth";
import { getConversations, getThread, getUnreadCount, sendMessage } from "../services/messageService";
import type { Env } from "../env";

export const messages = new Hono<{ Bindings: Env }>();

/** GET /api/messages — the caller's conversations (one preview per other party) + total unread. */
messages.get("/api/messages", async (c) => {
  const userId = await requireUserId(c);
  const db = createDb(c.env.DB);
  const conversations = await getConversations(db, userId);
  return c.json({ conversations, unread: await getUnreadCount(db, userId) });
});

/** GET /api/messages/:userId — the thread with one other user (marks received messages read). */
messages.get("/api/messages/:userId", async (c) => {
  const userId = await requireUserId(c);
  const thread = await getThread(createDb(c.env.DB), userId, c.req.param("userId"));
  return c.json(thread);
});

/** POST /api/messages — send a message to another user. */
messages.post("/api/messages", async (c) => {
  const userId = await requireUserId(c);
  const parsed = sendMessageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const dto = await sendMessage(createDb(c.env.DB), userId, parsed.data);
  return c.json(dto, 201);
});
