import { Hono } from "hono";
import type { ZodSchema } from "zod";
import {
  createLayerSchema,
  updateLayerSchema,
  createPlaceSchema,
  updatePlaceSchema,
  sanctionSchema,
  type ModeratedContentType,
} from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireAdmin } from "../lib/auth";
import { NotFound } from "../lib/errors";
import { createLogger } from "../lib/logger";
import {
  getLayers,
  createLayer,
  updateLayer,
  deleteLayer,
  getPlaces,
  createPlace,
  updatePlace,
  deletePlace,
} from "../services/placesService";
import {
  getQueue,
  dismissContent,
  removeContent,
  sanctionUser,
  type SanctionAction,
} from "../services/moderationService";
import type { Env } from "../env";

/** Narrow the `:contentType` route param to the moderated set, or 404 (defence-in-depth). */
function contentType(raw: string): ModeratedContentType {
  if (raw === "stay" || raw === "event") return raw;
  throw NotFound();
}

/**
 * Admin surface (010). Every route is behind `requireAdmin` — a non-admin gets 403 `auth.forbidden`,
 * a signed-out caller 401. Hosts the layers/places manager (US2); future 006 controls mount here too.
 */
export const admin = new Hono<{ Bindings: Env }>();

/** Parse the JSON body against a schema or return the shared 400 error shape. */
async function parse<T>(c: { req: { json: () => Promise<unknown> } }, schema: ZodSchema<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    res: Response.json({ errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) }, { status: 400 }),
  };
}

/** GET /api/admin/me — 200 { isAdmin: true } iff the caller is (or is just-promoted to) an admin. */
admin.get("/api/admin/me", async (c) => {
  await requireAdmin(c);
  return c.json({ isAdmin: true });
});

// ── Layers ────────────────────────────────────────────────────────────────
admin.get("/api/admin/layers", async (c) => {
  await requireAdmin(c);
  return c.json({ layers: await getLayers(createDb(c.env.DB)) });
});

admin.post("/api/admin/layers", async (c) => {
  await requireAdmin(c);
  const p = await parse(c, createLayerSchema);
  if (!p.ok) return p.res;
  return c.json(await createLayer(createDb(c.env.DB), p.data), 201);
});

admin.patch("/api/admin/layers/:id", async (c) => {
  await requireAdmin(c);
  const p = await parse(c, updateLayerSchema);
  if (!p.ok) return p.res;
  return c.json(await updateLayer(createDb(c.env.DB), c.req.param("id"), p.data));
});

admin.delete("/api/admin/layers/:id", async (c) => {
  await requireAdmin(c);
  await deleteLayer(createDb(c.env.DB), c.req.param("id"));
  return c.body(null, 204);
});

// ── Places ──────────────────────────────────────────────────────────────
admin.get("/api/admin/places", async (c) => {
  await requireAdmin(c);
  return c.json({ places: await getPlaces(createDb(c.env.DB), c.req.query("layerId") || undefined) });
});

admin.post("/api/admin/places", async (c) => {
  await requireAdmin(c);
  const p = await parse(c, createPlaceSchema);
  if (!p.ok) return p.res;
  return c.json(await createPlace(createDb(c.env.DB), p.data), 201);
});

admin.patch("/api/admin/places/:id", async (c) => {
  await requireAdmin(c);
  const p = await parse(c, updatePlaceSchema);
  if (!p.ok) return p.res;
  return c.json(await updatePlace(createDb(c.env.DB), c.req.param("id"), p.data));
});

admin.delete("/api/admin/places/:id", async (c) => {
  await requireAdmin(c);
  await deletePlace(createDb(c.env.DB), c.req.param("id"));
  return c.body(null, 204);
});

// ── Moderation queue & content actions (006 US3) ─────────────────────────────
admin.get("/api/admin/moderation", async (c) => {
  await requireAdmin(c);
  return c.json({ entries: await getQueue(createDb(c.env.DB)) });
});

admin.post("/api/admin/moderation/:contentType/:contentId/dismiss", async (c) => {
  await requireAdmin(c);
  await dismissContent(createDb(c.env.DB), contentType(c.req.param("contentType")), c.req.param("contentId"));
  return c.json({ ok: true });
});

admin.post("/api/admin/moderation/:contentType/:contentId/remove", async (c) => {
  await requireAdmin(c);
  await removeContent(createDb(c.env.DB), contentType(c.req.param("contentType")), c.req.param("contentId"));
  return c.json({ ok: true });
});

// ── User sanctions (006 US3) ─────────────────────────────────────────────────
/** POST /api/admin/users/:id/{warn|suspend|ban|reinstate} — routed by action, body carries only suspendDays. */
function sanctionRoute(action: SanctionAction) {
  admin.post(`/api/admin/users/:id/${action}`, async (c) => {
    const adminId = await requireAdmin(c);
    const targetId = c.req.param("id");
    const p = await parse(c, sanctionSchema);
    if (!p.ok) return p.res;
    const result = await sanctionUser(createDb(c.env.DB), targetId, action, p.data.suspendDays);
    createLogger({ path: c.req.path }).info("admin.sanction", { action, adminId, targetId, status: result.status });
    return c.json({ ok: true, status: result.status, suspendedUntil: result.suspendedUntil });
  });
}
(["warn", "suspend", "ban", "reinstate"] as const).forEach(sanctionRoute);
