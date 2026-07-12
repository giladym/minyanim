import { z } from "zod";
import { DISCOVERY_RADIUS_KM } from "../config";
import { NusachSchema, EventTypeSchema, CategorySchema, OccasionSchema, type PublicEventDTO } from "./event";
import type { PlaceDTO, LayerDTO } from "./place";

/** CSV query param → array of enum values (e.g. `types=minyan,gathering`). Empty/absent = no filter;
 * unknown parts are dropped (lenient). */
const csvEnum = <T extends string>(schema: z.ZodType<T>) =>
  z
    .string()
    .optional()
    .transform((s): T[] | undefined => {
      if (!s) return undefined;
      const out: T[] = [];
      for (const raw of s.split(",")) {
        const r = schema.safeParse(raw.trim());
        if (r.success) out.push(r.data);
      }
      return out.length ? out : undefined;
    });

/**
 * Discovery query (FR-001/008). A bounding box from centre + radius, or a city/country match for
 * coordless data, plus a date range and optional filters. Requires no Stay of the caller's (D22).
 */
export const DiscoveryQuery = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().default(DISCOVERY_RADIUS_KM),
  city: z.string().optional(),
  country: z.string().optional(),
  from: z.coerce.number().int(),
  to: z.coerce.number().int(),
  // 014 kind filters: `types` (minyan,gathering) + `categories` (hosting,social) + `occasion`. Absent
  // = all. nusach/seferTorah are minyan-only sub-filters (applied only to minyan rows).
  types: csvEnum(EventTypeSchema),
  categories: csvEnum(CategorySchema),
  occasion: OccasionSchema.optional(),
  nusach: NusachSchema.optional(),
  // Present+true filters to Torah-only; absent or "false" = no filter (D17). NOT z.coerce.boolean
  // (which would turn the string "false" into true).
  seferTorah: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional(),
});
export type DiscoveryQueryType = z.infer<typeof DiscoveryQuery>;

/** A traveler in the area a signed-in viewer can reach out to (to form a minyan). Phone appears
 * only when the traveler shares it (registered `user.sharePhone`, or a seeded per-stay contact). */
export interface TravelerContact {
  name: string;
  phone: string | null;
  numMen: number;
}

/** Per-Shabbat potential bucket (R3). `shabbat` is the Saturday civil date "YYYY-MM-DD". */
export interface PotentialBucket {
  shabbat: string;
  menCount: number;
  seferTorahCount: number;
  /** The individual travelers covering this Shabbat, with contact for those who share it. */
  travelers: TravelerContact[];
}

/**
 * GET /api/discovery response (and /near-stay). Kosher/Jewish places in the viewport — including Chabad
 * houses — are surfaced via the generic 010 places model (`places` grouped by `layerId`, toggled by the
 * active `layers` list), the same shape `GET /api/places` returns. This replaces the retired bespoke
 * Beit Chabad overlay (amends 003 D18; feature 011). Places are informational (not joinable).
 */
export interface DiscoveryResult {
  potential: PotentialBucket[];
  /** All in-scope event kinds near the viewport (minyan + gatherings), address-free + fuzzed coords
   * (SC-003). Filtered by the `types`/`categories`/`occasion` query params; FE reads `type`/`category`
   * to render + the kind filter chips (US2). Minyan-only sub-filters (nusach/seferTorah) apply only to
   * minyan rows. */
  events: PublicEventDTO[];
  places: PlaceDTO[];
  layers: LayerDTO[];
  attribution: string;
}
