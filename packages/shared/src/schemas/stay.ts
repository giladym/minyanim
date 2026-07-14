import { z } from "zod";

/**
 * 015: a Stay (location) is a pure anchor — city/dates/address/contact + a light **group size**
 * (`numMen`, "מי מגיע", feeds discovery potential-matchmaking). The minyan-specific fields
 * (prayer-needs + Sefer-Torah) were REMOVED from the location and now live on actual minyan events
 * attached to it (migration 0015). A location carries 0…N events via `event.stayId`.
 */

/** Stored lifecycle state of a Stay (D5). "past" is derived, never stored. */
export const StayStatusSchema = z.enum(["active", "cancelled"]);
export type StayStatus = z.infer<typeof StayStatusSchema>;

/**
 * Which slice of a user's Stays to read (004 D1). `active` = the dashboard (upcoming/in-progress);
 * `history` = past + cancelled, cursor-paginated. Membership is derived in-service, not stored.
 */
export const StayScope = z.enum(["active", "history"]);
export type StayScopeType = z.infer<typeof StayScope>;

/**
 * Create-Stay request body (shared SSOT). STRUCTURAL rules only — the temporal "not in the
 * past" check is destination-timezone-aware and runs server-side (T013). Dates are date-only
 * epoch-ms at UTC midnight of the civil date (D4).
 */
export const CreateStayInput = z
  .object({
    city: z.string().min(1, "location.required"),
    country: z.string().min(1, "location.required"),
    lat: z.number().nullish(),
    lng: z.number().nullish(),
    addressPrivate: z.string().max(500).nullish(),
    arrivalDate: z.number().int(),
    departureDate: z.number().int(),
    numMen: z.number().int().min(1, "num_men.too_low").max(1000, "num_men.too_high"),
    contactName: z.string().max(120).nullish(),
    contactPhone: z.string().nullish(),
    contactEmail: z.string().email().nullish(),
    groupMembers: z.string().max(2000).nullish(),
    notes: z.string().max(2000).nullish(),
    folderId: z.string().nullish(),
  })
  .refine((d) => d.departureDate >= d.arrivalDate, {
    message: "date.range_invalid",
    path: ["departureDate"],
  });
export type CreateStayInputType = z.infer<typeof CreateStayInput>;

/**
 * Partial update of a Stay (US3). All fields optional; the range rule is enforced only when
 * BOTH dates are present in the patch. The no-move-into-the-past temporal rule is server-side.
 */
export const UpdateStayInput = z
  .object({
    city: z.string().min(1, "location.required").optional(),
    country: z.string().min(1, "location.required").optional(),
    lat: z.number().nullish(),
    lng: z.number().nullish(),
    addressPrivate: z.string().max(500).nullish(),
    arrivalDate: z.number().int().optional(),
    departureDate: z.number().int().optional(),
    numMen: z.number().int().min(1, "num_men.too_low").max(1000, "num_men.too_high").optional(),
    contactName: z.string().max(120).nullish(),
    contactPhone: z.string().nullish(),
    contactEmail: z.string().email().nullish(),
    groupMembers: z.string().max(2000).nullish(),
    notes: z.string().max(2000).nullish(),
    folderId: z.string().nullish(),
  })
  .refine(
    (d) =>
      d.arrivalDate === undefined ||
      d.departureDate === undefined ||
      d.departureDate >= d.arrivalDate,
    { message: "date.range_invalid", path: ["departureDate"] },
  );
export type UpdateStayInputType = z.infer<typeof UpdateStayInput>;

/**
 * Owner-facing Stay representation (002 emits this only). Includes the private fields
 * (addressPrivate / contactPhone / contactEmail). `isPast` / `coversShabbat` are server-derived.
 */
export interface OwnerStayDTO {
  id: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  addressPrivate: string | null;
  arrivalDate: number;
  departureDate: number;
  numMen: number;
  status: StayStatus;
  isPast: boolean;
  coversShabbat: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  groupMembers: string | null;
  notes: string | null;
  folderId: string | null;
  /**
   * History tag (004 D2), derived in `toOwnerDTO`: `cancelled` if the Stay is cancelled, else
   * `attended` if past, else `null` (active/upcoming). Owner-only — omitted from `PublicStayDTO`.
   */
  historyTag: "attended" | "cancelled" | null;
  /** Owner-managed photo gallery refs (012); owner-only. */
  images: string[] | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Public Stay representation (003). Structurally OMITS the private fields so they can never
 * leak even when a response is hand-built (D8); also omits the owner-only `historyTag` (004 D11).
 */
export type PublicStayDTO = Omit<
  OwnerStayDTO,
  "addressPrivate" | "contactPhone" | "contactEmail" | "historyTag" | "images"
>;

/**
 * A page of History Stays (004 D10). `nextCursor` is an opaque base64 token
 * (`${departureDateMs}_${id}`) or `null` when the source is exhausted. Hand-built by the
 * controller (like `toOwnerResponse`) — not a Zod schema.
 */
export interface HistoryPage {
  stays: OwnerStayDTO[];
  nextCursor: string | null;
}

/**
 * Project an owner DTO to its public form by structurally stripping the private fields
 * (addressPrivate / contactPhone / contactEmail). 003 uses this; the key absence guarantees
 * private fields can't leak (D8).
 */
export function toPublicStayDTO(owner: OwnerStayDTO): PublicStayDTO {
  return {
    id: owner.id,
    city: owner.city,
    country: owner.country,
    lat: owner.lat,
    lng: owner.lng,
    arrivalDate: owner.arrivalDate,
    departureDate: owner.departureDate,
    numMen: owner.numMen,
    status: owner.status,
    isPast: owner.isPast,
    coversShabbat: owner.coversShabbat,
    contactName: owner.contactName,
    groupMembers: owner.groupMembers,
    notes: owner.notes,
    folderId: owner.folderId,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
  };
}

/** One normalized geocoding result (provider output mapped to this internal shape). */
export const GeoResultSchema = z.object({
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  label: z.string(),
});
export type GeoResult = z.infer<typeof GeoResultSchema>;

/** GET /api/geo/search response shape. */
export interface GeoSearchResponse {
  results: GeoResult[];
  attribution: string;
}
