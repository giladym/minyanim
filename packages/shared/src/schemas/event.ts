import { z } from "zod";
import { PARTY_SIZE_MAX, EVENT_CAPACITY_MAX } from "../config";
import type { AttendanceStatus } from "./attendance";

/**
 * Generic event contracts (003 D21, generalized in 014). An event has a **behavior** (`type`) and,
 * for gatherings, a user-facing **category**:
 *   - `type: "minyan"`   → quorum-readiness behavior; minyan-specific detail (nusach/services/roles).
 *   - `type: "gathering"`→ capacity + RSVP behavior; a `category` (hosting/social/…) selects the
 *     validated per-category `attrs` (a hosting gathering = the "open your table for a seudah" flow).
 * occasion / rsvpMode / visibility / capacity are independent axes on every event. A Minyan is one of
 * two behaviors, not a special case — its shipped contracts below are preserved unchanged (SC-005).
 */

// ── Behavior + axes ──────────────────────────────────────────────────────────

/** Behavior class (R1). NOT the user-facing kind — see EVENT_KINDS. */
export const EventTypeSchema = z.enum(["minyan", "gathering"]);
export type EventType = z.infer<typeof EventTypeSchema>;

/** User-facing kind for gatherings (R1). v1 builds hosting + social; learning/celebration are
 * model-ready fast-follows. Extensible enum now; can graduate to an admin-managed table later. */
export const CategorySchema = z.enum(["hosting", "social", "learning", "celebration"]);
export type Category = z.infer<typeof CategorySchema>;

/** Cross-cutting occasion tag (R5). "none"/null = no occasion. Orthogonal to type+category. */
export const OccasionSchema = z.enum([
  "shabbat",
  "rosh_hashanah",
  "yom_kippur",
  "sukkot",
  "pesach",
  "shavuot",
  "chanukah",
  "purim",
  "none",
]);
export type Occasion = z.infer<typeof OccasionSchema>;

/** How a viewer joins (R3). Independent of visibility. */
export const RsvpModeSchema = z.enum(["open", "approval", "invite"]);
export type RsvpMode = z.infer<typeof RsvpModeSchema>;

/** Discoverability (R3). Independent of rsvpMode. */
export const VisibilitySchema = z.enum(["public", "unlisted", "invite"]);
export type Visibility = z.infer<typeof VisibilitySchema>;

/** Derived, never stored: are new requests/joins open, given rsvpCutoff/eventDate vs now (R11)? */
export type RsvpState = "open" | "closed";

export const TefillaSchema = z.enum(["shacharit", "mincha", "maariv"]);
export type Tefilla = z.infer<typeof TefillaSchema>;

export const NusachSchema = z.enum(["ashkenaz", "sefard", "chabad", "mizrachi", "any"]);
export type Nusach = z.infer<typeof NusachSchema>;

export const EventRoleSchema = z.enum(["baal_tefila", "baal_korei"]);
export type EventRole = z.infer<typeof EventRoleSchema>;

/** Stored lifecycle (D7). quorum-reached / ready / full / completed are DERIVED, never stored. */
export const EventStatusStoredSchema = z.enum(["forming", "cancelled"]);
export type EventStatusStored = z.infer<typeof EventStatusStoredSchema>;

/** Full (derived) status surfaced to clients (R4). Minyan variant. */
export type MinyanStatus = "forming" | "quorum-reached" | "ready" | "completed" | "cancelled";
/** Full (derived) status for a gathering (capacity/RSVP behavior). */
export type GatheringStatus = "forming" | "full" | "completed" | "cancelled";

const EVENT_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Minyan detail (type:"minyan") — unchanged from 003 ────────────────────────

/** One tefilla within a Minyan gathering, with an optional local time (D3, "time optional"). */
export const MinyanServiceSchema = z.object({
  tefilla: TefillaSchema,
  time: z.string().regex(EVENT_TIME_RE, "event.time_invalid").nullish(),
});
export type MinyanService = z.infer<typeof MinyanServiceSchema>;

/** Minyan-specific attributes (the `type:"minyan"` detail): a nusach, Sefer Torah, + services. */
export const MinyanAttrsSchema = z.object({
  nusach: NusachSchema.default("any"),
  seferTorah: z.boolean().default(false),
  services: z.array(MinyanServiceSchema).min(1),
});
export type MinyanAttrs = z.infer<typeof MinyanAttrsSchema>;

// ── Gathering detail (type:"gathering") — per-category attrs (014) ─────────────

/** Which meal/seudah is served at a hosting gathering ("meal" here = the food, not the event kind). */
export const MealTypeSchema = z.enum([
  "shabbat_dinner",
  "shabbat_lunch",
  "seudah_shlishit",
  "holiday_meal",
  "weekday",
]);
export type MealType = z.infer<typeof MealTypeSchema>;

export const KashrutSchema = z.enum(["glatt", "kosher", "dairy", "vegetarian", "other"]);
export type Kashrut = z.infer<typeof KashrutSchema>;

/** `category: "hosting"` attrs (FR-009). Seats live on `event.capacity`, not here (R12). */
export const HostingAttrsSchema = z.object({
  mealType: MealTypeSchema,
  kashrut: KashrutSchema,
  dietary: z.array(z.string()).default([]),
  offering: z.string().max(2000).nullish(),
  bringItems: z.string().max(2000).nullish(),
  alcohol: z.boolean().default(false),
  accessibility: z.string().max(2000).nullish(),
});
export type HostingAttrs = z.infer<typeof HostingAttrsSchema>;

export const SocialSubcategorySchema = z.enum(["party", "kiddush", "farbrengen", "meetup", "other"]);
export type SocialSubcategory = z.infer<typeof SocialSubcategorySchema>;

/** `category: "social"` attrs (FR-010). */
export const SocialAttrsSchema = z.object({
  subcategory: SocialSubcategorySchema,
});
export type SocialAttrs = z.infer<typeof SocialAttrsSchema>;

/**
 * Per-category attrs schema map (A3). The wire `gathering` block carries NO `category` key (the
 * discriminator lives in the sibling `event.category`), so validation is
 * `ATTRS_BY_CATEGORY[category].parse(body.gathering)` — a lookup, not a z.discriminatedUnion.
 * Only v1 categories are present; adding a category = adding an entry here.
 */
export const ATTRS_BY_CATEGORY = {
  hosting: HostingAttrsSchema,
  social: SocialAttrsSchema,
} as const;

/** Categories with a built attrs schema in v1 (hosting + social). */
export type BuiltCategory = keyof typeof ATTRS_BY_CATEGORY;
export type GatheringAttrs = HostingAttrs | SocialAttrs;

// ── Category / kind config (data, shared by FE + server) ──────────────────────

/** Data-level per-category config (A4). `labelKey` is an i18n key (never a literal string —
 * constitution i18n-only); `defaultRsvpMode` seeds the create form + server defaults. */
export const CATEGORY_META: Record<
  BuiltCategory,
  { labelKey: string; icon: string; defaultRsvpMode: RsvpMode }
> = {
  hosting: { labelKey: "eventKind.hosting", icon: "utensils", defaultRsvpMode: "approval" },
  social: { labelKey: "eventKind.social", icon: "sparkles", defaultRsvpMode: "open" },
};

/** The user-facing "kind" the create picker + discovery chips show, mapped to (type, category).
 * The ONE home of the kind→(type,category) mapping (A4): FE picker, discovery chips, `?kind=` deep
 * links, and server default-resolution all read this. `minyan` has no category. */
export const EVENT_KINDS = {
  minyan: { type: "minyan", category: null, labelKey: "eventKind.minyan", icon: "star-of-david" },
  hosting: { type: "gathering", category: "hosting", labelKey: "eventKind.hosting", icon: "utensils" },
  social: { type: "gathering", category: "social", labelKey: "eventKind.social", icon: "sparkles" },
} as const satisfies Record<string, { type: EventType; category: Category | null; labelKey: string; icon: string }>;
export type EventKind = keyof typeof EVENT_KINDS;

// ── Inputs ────────────────────────────────────────────────────────────────────

/**
 * Create-an-event request body (shared SSOT). STRUCTURAL rules only — the "not in the past" check is
 * destination-tz-aware and runs server-side from the mandatory coords. `eventDate` is a date-only
 * epoch-ms at UTC midnight of the civil date (002 convention). Exactly ONE detail block is sent,
 * matching `type`: `minyan` for a minyan, `gathering` (a raw attrs object validated by the route via
 * ATTRS_BY_CATEGORY[category]) for a gathering. `category` is required when `type='gathering'` and
 * forbidden for a minyan (enforced in the service — kept lenient here so one schema serves both).
 */
export const CreateEventInput = z.object({
  type: EventTypeSchema.default("minyan"),
  category: CategorySchema.optional(),
  title: z.string().max(200).nullish(),
  city: z.string().min(1, "location.required"),
  country: z.string().min(1, "location.required"),
  lat: z.number(),
  lng: z.number(),
  addressPrivate: z.string().max(500).nullish(),
  addressNotes: z.string().max(2000).nullish(),
  eventDate: z.number().int(),
  startTime: z.string().regex(EVENT_TIME_RE, "event.time_invalid").nullish(),
  endTime: z.string().regex(EVENT_TIME_RE, "event.time_invalid").nullish(),
  rsvpCutoff: z.number().int().nullish(),
  occasion: OccasionSchema.optional(),
  rsvpMode: RsvpModeSchema.optional(),
  visibility: VisibilitySchema.optional(),
  capacity: z.number().int().min(1, "capacity.invalid").max(EVENT_CAPACITY_MAX, "capacity.invalid").nullish(),
  notes: z.string().max(2000).nullish(),
  // Exactly one detail block, matching `type` (validated in the service):
  minyan: MinyanAttrsSchema.optional(),
  gathering: z.record(z.string(), z.unknown()).optional(),
  // Host self-commit party size — used only when `hostSelfAttends` (minyan). Ignored for gatherings.
  hostNumMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
  // When hosted "from a Stay", the originating stay id — persisted on the host's self-attendance so
  // the minyan is trackable back to that Stay (013 location-change guard).
  stayId: z.string().nullish(),
});
export type CreateEventInputType = z.infer<typeof CreateEventInput>;

/** Host edit (PATCH). Date is immutable in v1; generic axes + the type/category detail are editable. */
export const UpdateEventInput = z.object({
  title: z.string().max(200).nullish(),
  addressPrivate: z.string().max(500).nullish(),
  addressNotes: z.string().max(2000).nullish(),
  notes: z.string().max(2000).nullish(),
  startTime: z.string().regex(EVENT_TIME_RE, "event.time_invalid").nullish(),
  endTime: z.string().regex(EVENT_TIME_RE, "event.time_invalid").nullish(),
  rsvpCutoff: z.number().int().nullish(),
  occasion: OccasionSchema.optional(),
  rsvpMode: RsvpModeSchema.optional(),
  visibility: VisibilitySchema.optional(),
  capacity: z.number().int().min(1, "capacity.invalid").max(EVENT_CAPACITY_MAX, "capacity.invalid").nullish(),
  // minyan detail (unchanged shape)
  nusach: NusachSchema.optional(),
  seferTorah: z.boolean().optional(),
  services: z.array(MinyanServiceSchema).min(1).optional(),
  // gathering detail (raw attrs; validated by the route per category)
  gathering: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateEventInputType = z.infer<typeof UpdateEventInput>;

// ── DTOs ──────────────────────────────────────────────────────────────────────

/** FR-006 — what a below-ready Minyan still needs. */
export interface MissingForReady {
  menShort: number;
  seferTorah: boolean;
  baalKorei: boolean;
}

/** A co-participant as seen by another committed participant (D4). Contact (phone/email) is
 * visible to fellow committed participants so they can coordinate — never in the public view. */
export interface ParticipantInfo {
  userId: string;
  name: string;
  numMen: number;
  phone: string | null;
  email: string | null;
  image: string | null;
  isHost?: boolean;
}

/** A minyan linked to a Stay via the user's commitment (013 location-change guard). */
export interface LinkedMinyanDTO {
  eventId: string;
  city: string;
  country: string;
  eventDate: number;
  isHost: boolean;
}

/**
 * Fields common to every event's public tier (014). The new generic axes appear on ALL events; the
 * minyan DTO below extends this so shipped minyan consumers keep working (they ignore new fields).
 */
export interface PublicEventCommon {
  id: string;
  type: EventType;
  /** null for a minyan; the gathering kind otherwise. */
  category: Category | null;
  /** null/"none" = no occasion. */
  occasion: Occasion | null;
  /** Host-set title; null for a minyan (its label is derived from services/place). */
  title: string | null;
  city: string;
  country: string;
  lat: number;
  lng: number;
  eventDate: number;
  startTime: string | null;
  endTime: string | null;
  rsvpCutoff: number | null;
  rsvpMode: RsvpMode;
  visibility: Visibility;
  /** Guest seats; null = unlimited (gatherings only; always null for a minyan — R12). */
  capacity: number | null;
  /** Derived: capacity − confirmed party-size sum; null when capacity is null. */
  seatsRemaining: number | null;
  /** Derived from rsvpCutoff/eventDate vs now (R11). */
  rsvpState: RsvpState;
  notes: string | null;
  hostName: string;
  hostImage: string | null;
  images: string[] | null;
  /** Viewer-relative (not private): true when the requesting user hosts this event. */
  viewerIsHost?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Public Minyan representation (discovery, WhatsApp share, pre-auth join). Private fields
 * (specific address, host/participant contact) are STRUCTURALLY ABSENT (D4/SC-005). Extends the
 * 014 common base; the minyan-specific derived fields below are unchanged from 003.
 */
export interface PublicMinyanDTO extends PublicEventCommon {
  type: "minyan";
  nusach: Nusach;
  seferTorah: boolean;
  services: MinyanService[];
  committedMen: number;
  status: MinyanStatus;
  isShabbatShacharit: boolean;
  missingForReady: MissingForReady;
  rolesFilled: { baalTefila: boolean; baalKorei: boolean };
}

/** Public gathering (hosting/social) representation. `attrs` is the validated per-category detail;
 * `confirmedCount` is the attendee headcount (party-size sum). No private fields (SC-003). */
export interface PublicGatheringDTO extends PublicEventCommon {
  type: "gathering";
  category: Category;
  attrs: GatheringAttrs;
  status: GatheringStatus;
  confirmedCount: number;
}

/** Any event's public tier (discovery/share/pre-auth). Discriminated on `type`. */
export type PublicEventDTO = PublicMinyanDTO | PublicGatheringDTO;

/** Signed-in browser view (minyan): adds the participant list + host contact. Coordinates stay
 * FUZZED and the private address is absent — those reveal only on commit. */
export interface RosterMinyanDTO extends PublicMinyanDTO {
  hostContact: { name: string; phone: string | null; email: string | null };
  participants: ParticipantInfo[];
  myRoles: { baalTefila: boolean; baalKorei: boolean };
}

/** Signed-in browser view (gathering). For a **hosting** gathering the confirmed guest list is
 * host/confirmed-only (A8/M1) — a non-confirmed viewer gets `attendees: null` + `confirmedCount`.
 * Social gatherings expose the roster like a minyan. `myStatus` is the viewer's own attendance. */
export interface RosterGatheringDTO extends PublicGatheringDTO {
  hostContact: { name: string; phone: string | null; email: string | null };
  /** null when withheld (a non-confirmed viewer of a hosting gathering, A8). */
  attendees: ParticipantInfo[] | null;
  myStatus: AttendanceStatus | null;
}

/** Committed-participant view (minyan): adds the private address + entry notes + exact coordinates. */
export interface ParticipantMinyanDTO extends RosterMinyanDTO {
  addressPrivate: string | null;
  addressNotes: string | null;
}

/** Confirmed-attendee view (gathering): adds the private address + entry notes + exact coordinates. */
export interface ParticipantGatheringDTO extends RosterGatheringDTO {
  addressPrivate: string | null;
  addressNotes: string | null;
}

/** Host's full view (minyan). */
export interface OwnerMinyanDTO extends ParticipantMinyanDTO {
  isHost: true;
}

/** Host's full view (gathering): adds the pending-request queue (approval mode) + full attendee list. */
export interface OwnerGatheringDTO extends ParticipantGatheringDTO {
  isHost: true;
  /** Pending requests awaiting approval (approval mode), ordered earliest-first. */
  pendingRequests: PendingRequestDTO[];
}

export type RosterEventDTO = RosterMinyanDTO | RosterGatheringDTO;
export type ParticipantEventDTO = ParticipantMinyanDTO | ParticipantGatheringDTO;
export type OwnerEventDTO = OwnerMinyanDTO | OwnerGatheringDTO;

/**
 * A compact "My events" row (FR-017). No private fields (address/contact) — a lightweight list that
 * links to the full event. `status` is the derived surfaced status per type; `myStatus` is the
 * viewer's own attendance (null for a hosted event whose host does not self-attend — a gathering).
 * `pendingRequestCount` is present only for hosted approval-mode events (the requests-queue badge).
 */
export interface MyEventRow {
  id: string;
  type: EventType;
  category: Category | null;
  title: string | null;
  city: string;
  country: string;
  eventDate: number;
  status: MinyanStatus | GatheringStatus;
  myStatus: AttendanceStatus | null;
  pendingRequestCount?: number;
}

/** The signed-in user's events, grouped by relationship (FR-017). */
export interface MyEventsDTO {
  hosting: MyEventRow[];
  attending: MyEventRow[];
}

/** A pending seat request shown to the host (approval mode). */
export interface PendingRequestDTO {
  attendanceId: string;
  userId: string;
  name: string;
  image: string | null;
  phone: string | null;
  partySize: number;
  requestedAt: number;
  status: AttendanceStatus;
}

/**
 * Project any owner/participant Minyan DTO to its public form by structurally stripping private
 * fields. Key absence guarantees no leak (D4/SC-005). Unchanged 003 behavior.
 */
export function toPublicMinyanDTO(m: PublicMinyanDTO): PublicMinyanDTO {
  return {
    id: m.id,
    type: "minyan",
    category: null,
    occasion: m.occasion,
    title: m.title,
    city: m.city,
    country: m.country,
    lat: m.lat,
    lng: m.lng,
    eventDate: m.eventDate,
    startTime: m.startTime,
    endTime: m.endTime,
    rsvpCutoff: m.rsvpCutoff,
    rsvpMode: m.rsvpMode,
    visibility: m.visibility,
    capacity: m.capacity,
    seatsRemaining: m.seatsRemaining,
    rsvpState: m.rsvpState,
    notes: m.notes,
    hostName: m.hostName,
    hostImage: m.hostImage,
    images: m.images,
    viewerIsHost: m.viewerIsHost,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    services: m.services,
    committedMen: m.committedMen,
    status: m.status,
    isShabbatShacharit: m.isShabbatShacharit,
    missingForReady: m.missingForReady,
    rolesFilled: m.rolesFilled,
  };
}

/** Project a gathering DTO to its public form by structurally stripping private fields (SC-003). */
export function toPublicGatheringDTO(g: PublicGatheringDTO): PublicGatheringDTO {
  return {
    id: g.id,
    type: "gathering",
    category: g.category,
    occasion: g.occasion,
    title: g.title,
    city: g.city,
    country: g.country,
    lat: g.lat,
    lng: g.lng,
    eventDate: g.eventDate,
    startTime: g.startTime,
    endTime: g.endTime,
    rsvpCutoff: g.rsvpCutoff,
    rsvpMode: g.rsvpMode,
    visibility: g.visibility,
    capacity: g.capacity,
    seatsRemaining: g.seatsRemaining,
    rsvpState: g.rsvpState,
    notes: g.notes,
    hostName: g.hostName,
    hostImage: g.hostImage,
    images: g.images,
    viewerIsHost: g.viewerIsHost,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    attrs: g.attrs,
    status: g.status,
    confirmedCount: g.confirmedCount,
  };
}

/** Project any public event DTO by type (SC-003 structural strip). */
export function toPublicEventDTO(e: PublicEventDTO): PublicEventDTO {
  return e.type === "minyan" ? toPublicMinyanDTO(e) : toPublicGatheringDTO(e);
}
