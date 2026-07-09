import { Hono } from "hono";
import { placesQuerySchema } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireUserId } from "../lib/auth";
import { getActiveLayers, nearPlaces } from "../services/placesService";
import type { Env } from "../env";

/** User-facing places read surface (010 US1). Auth-guarded (like discovery); public institutional
 * data, so no per-user projection. Cached briefly — the catalogue changes rarely. */
export const places = new Hono<{ Bindings: Env }>();

/** GET /api/places?lat&lng&radiusKm? — active-layer places near a point + the active-layer list. */
places.get("/api/places", async (c) => {
  await requireUserId(c);
  const parsed = placesQuerySchema.safeParse({
    lat: c.req.query("lat"),
    lng: c.req.query("lng"),
    radiusKm: c.req.query("radiusKm"),
  });
  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) }, 400);
  }
  const res = await nearPlaces(createDb(c.env.DB), parsed.data.lat, parsed.data.lng, parsed.data.radiusKm);
  return c.json(res, 200, { "cache-control": "private, max-age=300" });
});

/** GET /api/layers — the active layers (for filters/toggles when no point is set yet). */
places.get("/api/layers", async (c) => {
  await requireUserId(c);
  return c.json({ layers: await getActiveLayers(createDb(c.env.DB)) }, 200, { "cache-control": "private, max-age=300" });
});
