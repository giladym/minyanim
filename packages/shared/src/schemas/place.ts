import { z } from "zod";

/** Kosher/dietary metadata for a place — best-effort; sources vary and any field may be absent. */
export const kosherMetaSchema = z.object({
  /** Certification / hechsher name (free text). */
  certification: z.string().max(120).nullish(),
  /** Certifying agency (e.g. "OU", "OK", a local rabbanut). */
  agency: z.string().max(120).nullish(),
  /** Kitchen type where known. */
  dietary: z.enum(["meat", "dairy", "parve"]).nullish(),
});
export type KosherMeta = z.infer<typeof kosherMetaSchema>;

/** An admin-managed category that groups places (worship, restaurants, Chabad houses, mikvehs, …). */
export interface LayerDTO {
  id: string;
  name: string;
  /** Marker/label icon key (a token, e.g. "synagogue"); null = default. */
  icon: string | null;
  displayOrder: number;
  active: boolean;
}

/** A kosher/Jewish place as shown to a user. Provenance (source/sourceId/license) stays server-side;
 * the client only needs the renderable `attribution`. */
export interface PlaceDTO {
  id: string;
  layerId: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  hours: string | null;
  images: string[];
  kosherMeta: KosherMeta | null;
  /** Required attribution string to render (e.g. "© OpenStreetMap contributors"); null = none. */
  attribution: string | null;
}

/** GET /api/places response — active layers + the places within the requested radius (the client
 * groups places by `layerId` and drives layer toggles from `layers`). */
export interface PlacesResponse {
  layers: LayerDTO[];
  places: PlaceDTO[];
}

/** GET /api/places query — accepts EITHER a point (`lat`+`lng` [+`radiusKm`]) OR a full viewport
 * bbox (`minLat`/`maxLat`/`minLng`/`maxLng`, for pan/zoom-driven reloads). Reuses the 003 bbox
 * convention; the service clamps an over-large bbox rather than rejecting it. */
export const placesQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(0.1).max(50).optional(),
    minLat: z.coerce.number().min(-90).max(90).optional(),
    maxLat: z.coerce.number().min(-90).max(90).optional(),
    minLng: z.coerce.number().min(-180).max(180).optional(),
    maxLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine(
    (q) =>
      (q.lat != null && q.lng != null) ||
      (q.minLat != null && q.maxLat != null && q.minLng != null && q.maxLng != null),
    { message: "place.query_point_or_bbox_required" },
  );
export type PlacesQuery = z.infer<typeof placesQuerySchema>;

// ── Admin inputs ────────────────────────────────────────────────────────────
export const createLayerSchema = z.object({
  name: z.string().trim().min(1, "layer.name_required").max(60),
  icon: z.string().max(40).nullish(),
  displayOrder: z.number().int().min(0).optional(),
});
export type CreateLayerInput = z.infer<typeof createLayerSchema>;

export const updateLayerSchema = z.object({
  name: z.string().trim().min(1, "layer.name_required").max(60).optional(),
  icon: z.string().max(40).nullish(),
  displayOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
export type UpdateLayerInput = z.infer<typeof updateLayerSchema>;

export const createPlaceSchema = z.object({
  layerId: z.string().min(1, "place.layer_required"),
  name: z.string().trim().min(1, "place.name_required").max(200),
  description: z.string().max(2000).nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(300).nullish(),
  phone: z.string().max(40).nullish(),
  hours: z.string().max(300).nullish(),
  images: z.array(z.string().url()).max(10).optional(),
  kosherMeta: kosherMetaSchema.nullish(),
});
export type CreatePlaceInput = z.infer<typeof createPlaceSchema>;

/** Partial of create — every field optional (PATCH). `layerId` stays a non-empty string when given. */
export const updatePlaceSchema = createPlaceSchema.partial();
export type UpdatePlaceInput = z.infer<typeof updatePlaceSchema>;
