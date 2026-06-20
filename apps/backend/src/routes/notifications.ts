import { Hono } from "hono";
import { createDb } from "../db/client";
import { requireUserId } from "../lib/auth";
import { listNotifications, unreadCount, markRead, markAllRead } from "../repositories/notificationRepository";
import type { NotificationDTO } from "@minyanim/shared";
import type { Env } from "../env";

export const notifications = new Hono<{ Bindings: Env }>();

/** GET /api/notifications?unreadOnly= — the caller's in-app inbox, newest-first, + unread count. */
notifications.get("/api/notifications", async (c) => {
  const userId = await requireUserId(c);
  const db = createDb(c.env.DB);
  const rows = await listNotifications(db, userId, c.req.query("unreadOnly") === "true");
  const dtos: NotificationDTO[] = rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    kind: r.kind as NotificationDTO["kind"],
    city: r.city,
    country: r.country,
    eventDate: r.eventDate.getTime(),
    read: Boolean(r.read),
    createdAt: r.createdAt.getTime(),
  }));
  return c.json({ notifications: dtos, unread: await unreadCount(db, userId) });
});

/** POST /api/notifications/:id/read — mark one read (owner-scoped). */
notifications.post("/api/notifications/:id/read", async (c) => {
  const userId = await requireUserId(c);
  await markRead(createDb(c.env.DB), userId, c.req.param("id"));
  return c.json({ ok: true });
});

/** POST /api/notifications/read-all — mark all read. */
notifications.post("/api/notifications/read-all", async (c) => {
  const userId = await requireUserId(c);
  await markAllRead(createDb(c.env.DB), userId);
  return c.json({ ok: true });
});
