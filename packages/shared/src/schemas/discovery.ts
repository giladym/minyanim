import { z } from "zod";
import { DISCOVERY_RADIUS_KM } from "../config";
import { NusachSchema, type PublicMinyanDTO } from "./event";

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
  nusach: NusachSchema.optional(),
  // Present+true filters to Torah-only; absent or "false" = no filter (D17). NOT z.coerce.boolean
  // (which would turn the string "false" into true).
  seferTorah: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional(),
});
export type DiscoveryQueryType = z.infer<typeof DiscoveryQuery>;

/** Per-Shabbat potential bucket (R3). `shabbat` is the Saturday civil date "YYYY-MM-DD". */
export interface PotentialBucket {
  shabbat: string;
  menCount: number;
  seferTorahCount: number;
}

/** Static Beit Chabad pin surfaced on the discovery map (D18). Informational only (not joinable). */
export interface BeitChabadPinDTO {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

/** GET /api/discovery response (and /near-stay). */
export interface DiscoveryResult {
  potential: PotentialBucket[];
  minyanim: PublicMinyanDTO[];
  beitChabad: BeitChabadPinDTO[];
  attribution: string;
}
