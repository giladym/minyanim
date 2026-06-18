import { Hono } from "hono";
import { computeToday } from "../lib/calendar";
import type { Env } from "../env";

export const calendar = new Hono<{ Bindings: Env }>();

// Public: the header calendar widget passes the user's local date (YYYY-MM-DD).
calendar.get("/api/calendar/today", (c) => {
  const date = c.req.query("date");
  const now = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date();
  try {
    const data = computeToday(now);
    c.header("cache-control", "public, max-age=3600");
    return c.json(data);
  } catch {
    return c.json({ error: "calendar_unavailable" }, 503);
  }
});
