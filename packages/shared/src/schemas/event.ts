import { z } from "zod";
import { PARTY_SIZE_MAX } from "../config";

/**
 * Generic event contracts (D21). A Minyan is an `event` with `type: "minyan"` plus minyan-specific
 * attributes. User-facing copy says "מניין"; `type` is a model concept. Future event types add a
 * `type` value + their own attrs without changing commitments/notifications/discovery.
 *
 * Granularity (D3, revised): a Minyan is a **gathering** — one place + one date + a SET of
 * tefillot (services), each with an optional time. Hosting a Shabbat is ONE Minyan with several
 * services; a single commitment joins the whole gathering; quorum = 10 men for the gathering.
 */

export const EventTypeSchema = z.enum(["minyan"]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const TefillaSchema = z.enum(["shacharit", "mincha", "maariv"]);
export type Tefilla = z.infer<typeof TefillaSchema>;

export const NusachSchema = z.enum(["ashkenaz", "sefard", "chabad", "mizrachi", "any"]);
export type Nusach = z.infer<typeof NusachSchema>;

export const EventRoleSchema = z.enum(["baal_tefila", "baal_korei"]);
export type EventRole = z.infer<typeof EventRoleSchema>;

/** Stored lifecycle (D7). quorum-reached / ready / completed are DERIVED, never stored. */
export const EventStatusStoredSchema = z.enum(["forming", "cancelled"]);
export type EventStatusStored = z.infer<typeof EventStatusStoredSchema>;

/** Full (derived) status surfaced to clients (R4). */
export type MinyanStatus = "forming" | "quorum-reached" | "ready" | "completed" | "cancelled";

const EVENT_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/**
 * Host-a-Minyan request body (shared SSOT). STRUCTURAL rules only — the "not in the past" check is
 * destination-tz-aware and runs server-side from the mandatory coords. `eventDate` is a date-only
 * epoch-ms at UTC midnight of the civil date (002 convention) — the Shabbat/day the gathering is on.
 */
export const CreateEventInput = z.object({
  type: EventTypeSchema.default("minyan"),
  city: z.string().min(1, "location.required"),
  country: z.string().min(1, "location.required"),
  lat: z.number(),
  lng: z.number(),
  addressPrivate: z.string().max(500).nullish(),
  addressNotes: z.string().max(2000).nullish(),
  eventDate: z.number().int(),
  notes: z.string().max(2000).nullish(),
  minyan: MinyanAttrsSchema,
  hostNumMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
  // When a minyan is hosted "from a Stay", the originating stay id — persisted on the host's
  // self-commitment so the minyan is trackable back to that Stay (013 location-change guard).
  stayId: z.string().nullish(),
});
export type CreateEventInputType = z.infer<typeof CreateEventInput>;

/** Host edit (PATCH). Date is immutable in v1; services/nusach/Torah/notes/address are editable. */
export const UpdateEventInput = z.object({
  addressPrivate: z.string().max(500).nullish(),
  addressNotes: z.string().max(2000).nullish(),
  notes: z.string().max(2000).nullish(),
  nusach: NusachSchema.optional(),
  seferTorah: z.boolean().optional(),
  services: z.array(MinyanServiceSchema).min(1).optional(),
});
export type UpdateEventInputType = z.infer<typeof UpdateEventInput>;

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
  /** Avatar ref (012); null = none → initials placeholder. */
  image: string | null;
  /** True for the host's own commitment (badged "organizer" in the roster). */
  isHost?: boolean;
}

/**
 * Public Minyan representation (discovery, WhatsApp share, pre-auth join). Private fields
 * (specific address, host/participant contact) are STRUCTURALLY ABSENT (D4/SC-005).
 */
/** A minyan linked to a Stay via the user's commitment (013 location-change guard) — enough to warn
 * about it and choose an action. `isHost` is true when the viewer hosts this minyan. */
export interface LinkedMinyanDTO {
  eventId: string;
  city: string;
  country: string;
  eventDate: number;
  isHost: boolean;
}

export interface PublicMinyanDTO {
  id: string;
  type: EventType;
  city: string;
  country: string;
  lat: number;
  lng: number;
  eventDate: number;
  nusach: Nusach;
  seferTorah: boolean;
  services: MinyanService[];
  notes: string | null;
  hostName: string;
  /** Host avatar ref (012); null = none → render an initials placeholder. */
  hostImage: string | null;
  /** Host-managed photo gallery refs (012). */
  images: string[] | null;
  committedMen: number;
  status: MinyanStatus;
  /** Derived: the gathering includes a Shabbat-morning Shacharit (Torah-reading) (R4). */
  isShabbatShacharit: boolean;
  missingForReady: MissingForReady;
  rolesFilled: { baalTefila: boolean; baalKorei: boolean };
  /** Viewer-relative: true when the requesting user hosts this minyan (drives the "your minyan"
   * badge + "manage" CTA in discovery). Absent/false for signed-out or non-host viewers. NOT a
   * private field — it's the viewer's own relationship, so it survives the public projection. */
  viewerIsHost?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Signed-in browser view: adds the participant list + host contact so a not-yet-committed viewer
 * can see who's coming and reach sharers to coordinate joining. Coordinates stay FUZZED and the
 * private address is absent — those reveal only on commit (below). Phone appears only for
 * participants who share it (`user.sharePhone`); email is committed-only (null here). */
export interface RosterMinyanDTO extends PublicMinyanDTO {
  hostContact: { name: string; phone: string | null; email: string | null };
  participants: ParticipantInfo[];
  /** Which role slots the viewing participant personally holds (drives claim vs release UI). */
  myRoles: { baalTefila: boolean; baalKorei: boolean };
}

/** Committed-participant view: adds the private address + entry notes on top of the roster, and the
 * exact coordinates (the public/roster lat/lng are fuzzed). */
export interface ParticipantMinyanDTO extends RosterMinyanDTO {
  addressPrivate: string | null;
  addressNotes: string | null;
}

/** Host's full view (management). Same shape as participant in v1; distinguished for future use. */
export interface OwnerMinyanDTO extends ParticipantMinyanDTO {
  isHost: true;
}

/**
 * Project any owner/participant DTO to its public form by structurally stripping private fields
 * (addressPrivate / hostContact / participants). The key absence guarantees no leak (D4/SC-005).
 */
export function toPublicMinyanDTO(m: PublicMinyanDTO): PublicMinyanDTO {
  return {
    id: m.id,
    type: m.type,
    city: m.city,
    country: m.country,
    lat: m.lat,
    lng: m.lng,
    eventDate: m.eventDate,
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    services: m.services,
    notes: m.notes,
    hostName: m.hostName,
    hostImage: m.hostImage,
    images: m.images,
    committedMen: m.committedMen,
    status: m.status,
    isShabbatShacharit: m.isShabbatShacharit,
    missingForReady: m.missingForReady,
    rolesFilled: m.rolesFilled,
    // Viewer-relative, not private — preserve it so discovery can badge the viewer's own minyan.
    viewerIsHost: m.viewerIsHost,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}
