import { Hono } from "hono";
import type { ZodSchema } from "zod";
import { createLayerSchema, updateLayerSchema, createPlaceSchema, updatePlaceSchema } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireAdmin } from "../lib/auth";
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
import type { Env } from "../env";

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
