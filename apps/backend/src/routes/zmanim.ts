import { Hono } from "hono";
import { requireUserId } from "../lib/auth";
import { createDb } from "../db/client";
import { stayZmanimController } from "../controllers/zmanimController";
import type { Env } from "../env";

// Per-Stay Shabbat zmanim (005). Owner-scoped; computed server-side (kosher-zmanim never crosses to
// the client, D1). The public Minyan zmanim read lives on the events router (no /api/minyan space).
export const zmanim = new Hono<{ Bindings: Env }>();

zmanim.get("/api/stays/:id/zmanim", async (c) => {
  const userId = await requireUserId(c);
  const res = await stayZmanimController(createDb(c.env.DB), userId, c.req.param("id"));
  c.header("cache-control", "private, max-age=3600");
  return c.json(res);
});
