import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { layer, place } from "../db/schema";
import type { Bbox } from "./discoveryRepository";
import type { KosherMeta } from "@minyanim/shared";

export type LayerRow = typeof layer.$inferSelect;
export type PlaceRow = typeof place.$inferSelect;

// ── Layers ────────────────────────────────────────────────────────────────
/** All layers (including retired) ordered for admin + user display. */
export function listLayers(db: Db): Promise<LayerRow[]> {
  return db.select().from(layer).orderBy(asc(layer.displayOrder), asc(layer.name));
}

export function getLayer(db: Db, id: string): Promise<LayerRow | undefined> {
  return db.select().from(layer).where(eq(layer.id, id)).limit(1).then((r) => r[0]);
}

export async function insertLayer(
  db: Db,
  values: { name: string; icon: string | null; displayOrder: number },
): Promise<LayerRow> {
  const now = new Date();
  const row = { id: `lyr_${crypto.randomUUID()}`, active: true, createdAt: now, updatedAt: now, ...values };
  await db.insert(layer).values(row);
  return row;
}

export async function updateLayerRow(
  db: Db,
  id: string,
  patch: Partial<{ name: string; icon: string | null; displayOrder: number; active: boolean }>,
): Promise<LayerRow | undefined> {
  await db.update(layer).set({ ...patch, updatedAt: new Date() }).where(eq(layer.id, id));
  return getLayer(db, id);
}

export async function countPlacesInLayer(db: Db, layerId: string): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(place).where(eq(place.layerId, layerId));
  return Number(rows[0]?.n ?? 0);
}

export async function deleteLayerRow(db: Db, id: string): Promise<boolean> {
  const removed = await db.delete(layer).where(eq(layer.id, id)).returning({ id: layer.id });
  return removed.length > 0;
}

// ── Places ──────────────────────────────────────────────────────────────
/** Places for admin management, optionally scoped to one layer, newest-first. */
export function listPlaces(db: Db, layerId?: string): Promise<PlaceRow[]> {
  const q = db.select().from(place);
  return (layerId ? q.where(eq(place.layerId, layerId)) : q).orderBy(asc(place.name));
}

export function getPlace(db: Db, id: string): Promise<PlaceRow | undefined> {
  return db.select().from(place).where(eq(place.id, id)).limit(1).then((r) => r[0]);
}

/** Manual admin-entered place (source "manual", license "internal"). */
export async function insertPlace(
  db: Db,
  values: {
    layerId: string; name: string; description: string | null; lat: number; lng: number;
    address: string | null; phone: string | null; hours: string | null; images: string[] | null;
    kosherMeta: KosherMeta | null;
  },
): Promise<PlaceRow> {
  const now = new Date();
  const row: PlaceRow = {
    id: `plc_${crypto.randomUUID()}`,
    source: "manual", sourceId: null, license: "internal", attribution: null,
    createdAt: now, updatedAt: now, ...values,
  };
  await db.insert(place).values(row);
  return row;
}

export async function updatePlaceRow(
  db: Db,
  id: string,
  patch: Partial<{
    layerId: string; name: string; description: string | null; lat: number; lng: number;
    address: string | null; phone: string | null; hours: string | null; images: string[] | null;
    kosherMeta: KosherMeta | null;
  }>,
): Promise<PlaceRow | undefined> {
  await db.update(place).set({ ...patch, updatedAt: new Date() }).where(eq(place.id, id));
  return getPlace(db, id);
}

export async function deletePlaceRow(db: Db, id: string): Promise<boolean> {
  const removed = await db.delete(place).where(eq(place.id, id)).returning({ id: place.id });
  return removed.length > 0;
}

/** Whether a layer id exists — validates a place's layer on create/update. */
export async function layerExists(db: Db, id: string): Promise<boolean> {
  return !!(await getLayer(db, id));
}

// ── User read path (US1) ──────────────────────────────────────────────────
/** Active layers only, ordered — the user-facing toggle list. */
export function listActiveLayers(db: Db): Promise<LayerRow[]> {
  return db.select().from(layer).where(eq(layer.active, true)).orderBy(asc(layer.displayOrder), asc(layer.name));
}

/** Places within the bbox that belong to an ACTIVE layer (the 003 near-me scan, reused). */
export function placesInBbox(db: Db, b: Bbox): Promise<PlaceRow[]> {
  return db
    .select()
    .from(place)
    .innerJoin(layer, eq(layer.id, place.layerId))
    .where(
      and(
        eq(layer.active, true),
        gte(place.lat, b.minLat),
        lte(place.lat, b.maxLat),
        gte(place.lng, b.minLng),
        lte(place.lng, b.maxLng),
      ),
    )
    .then((rows) => rows.map((r) => r.place));
}
