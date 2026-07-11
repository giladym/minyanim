import { Hono } from "hono";
import { placesQuerySchema } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireUserId } from "../lib/auth";
import { getActiveLayers, nearPlaces, placesInBboxView } from "../services/placesService";
import type { Env } from "../env";

/** User-facing places read surface (010 US1). Auth-guarded (like discovery); public institutional
 * data, so no per-user projection. Cached briefly — the catalogue changes rarely. */
export const places = new Hono<{ Bindings: Env }>();

/** GET /api/places — active-layer places + the active-layer list, either near a point
 * (`?lat&lng&radiusKm?`) or within a viewport bbox (`?minLat&maxLat&minLng&maxLng`, for pan/zoom). */
places.get("/api/places", async (c) => {
  await requireUserId(c);
  const parsed = placesQuerySchema.safeParse({
    lat: c.req.query("lat"),
    lng: c.req.query("lng"),
    radiusKm: c.req.query("radiusKm"),
    minLat: c.req.query("minLat"),
    maxLat: c.req.query("maxLat"),
    minLng: c.req.query("minLng"),
    maxLng: c.req.query("maxLng"),
  });
  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) }, 400);
  }
  const db = createDb(c.env.DB);
  const q = parsed.data;
  const res =
    q.minLat != null && q.maxLat != null && q.minLng != null && q.maxLng != null
      ? await placesInBboxView(db, { minLat: q.minLat, maxLat: q.maxLat, minLng: q.minLng, maxLng: q.maxLng })
      : await nearPlaces(db, q.lat!, q.lng!, q.radiusKm);
  return c.json(res, 200, { "cache-control": "private, max-age=300" });
});

/** GET /api/layers — the active layers (for filters/toggles when no point is set yet). */
places.get("/api/layers", async (c) => {
  await requireUserId(c);
  return c.json({ layers: await getActiveLayers(createDb(c.env.DB)) }, 200, { "cache-control": "private, max-age=300" });
});
