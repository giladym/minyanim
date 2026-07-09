import { Hono } from "hono";
import { requireAdmin } from "../lib/auth";
import type { Env } from "../env";

/**
 * Admin surface (010). Every route is behind `requireAdmin` — a non-admin gets 403 `auth.forbidden`,
 * a signed-out caller 401. The layers/places CRUD (US2) mounts here in a later slice; for now the
 * foundation exposes the canonical access check the frontend admin shell uses to gate itself.
 */
export const admin = new Hono<{ Bindings: Env }>();

/** GET /api/admin/me — 200 { isAdmin: true } iff the caller is (or is just-promoted to) an admin. */
admin.get("/api/admin/me", async (c) => {
  await requireAdmin(c);
  return c.json({ isAdmin: true });
});
