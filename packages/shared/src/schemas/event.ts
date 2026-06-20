import { z } from "zod";
import { PARTY_SIZE_MAX } from "../config";

/**
 * Generic event contracts (D21). A Minyan is an `event` with `type: "minyan"` plus minyan-specific
 * attributes. User-facing copy says "מניין"; `type` is a model concept. Future event types add a
 * `type` value + their own attrs without changing commitments/notifications/discovery.
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

/** Minyan-specific attributes (the `type:"minyan"` detail). */
export const MinyanAttrsSchema = z.object({
  tefilla: TefillaSchema,
  nusach: NusachSchema.default("any"),
  seferTorah: z.boolean().default(false),
});
export type MinyanAttrs = z.infer<typeof MinyanAttrsSchema>;

/**
 * Host-a-Minyan request body (shared SSOT). STRUCTURAL rules only — the "not in the past" check is
 * destination-tz-aware and runs server-side from the mandatory coords. `eventDate` is a date-only
 * epoch-ms at UTC midnight of the civil date (002 convention).
 */
export const CreateEventInput = z.object({
  type: EventTypeSchema.default("minyan"),
  city: z.string().min(1, "location.required"),
  country: z.string().min(1, "location.required"),
  lat: z.number(),
  lng: z.number(),
  addressPrivate: z.string().max(500).nullish(),
  eventDate: z.number().int(),
  eventTime: z.string().regex(EVENT_TIME_RE, "event.time_invalid"),
  minyan: MinyanAttrsSchema,
  hostNumMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
});
export type CreateEventInputType = z.infer<typeof CreateEventInput>;

/** Host edit (PATCH). Date + tefilla are immutable in v1 (R9/data-model). */
export const UpdateEventInput = z.object({
  addressPrivate: z.string().max(500).nullish(),
  eventTime: z.string().regex(EVENT_TIME_RE, "event.time_invalid").optional(),
  nusach: NusachSchema.optional(),
  seferTorah: z.boolean().optional(),
});
export type UpdateEventInputType = z.infer<typeof UpdateEventInput>;

/** FR-006 — what a below-ready Minyan still needs. */
export interface MissingForReady {
  menShort: number;
  seferTorah: boolean;
  baalKorei: boolean;
}

/** A co-participant as seen by another committed participant (D4). */
export interface ParticipantInfo {
  userId: string;
  name: string;
  numMen: number;
  phone: string | null;
  email: string | null;
}

/**
 * Public Minyan representation (discovery, WhatsApp share, pre-auth join). Private fields
 * (specific address, host/participant contact) are STRUCTURALLY ABSENT (D4/SC-005).
 */
export interface PublicMinyanDTO {
  id: string;
  type: EventType;
  city: string;
  country: string;
  lat: number;
  lng: number;
  eventDate: number;
  eventTime: string;
  tefilla: Tefilla;
  nusach: Nusach;
  seferTorah: boolean;
  hostName: string;
  committedMen: number;
  status: MinyanStatus;
  missingForReady: MissingForReady;
  rolesFilled: { baalTefila: boolean; baalKorei: boolean };
  createdAt: number;
  updatedAt: number;
}

/** Committed-participant view: adds the private address, host contact, and the participant list. */
export interface ParticipantMinyanDTO extends PublicMinyanDTO {
  addressPrivate: string | null;
  hostContact: { name: string; phone: string | null; email: string | null };
  participants: ParticipantInfo[];
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
    eventTime: m.eventTime,
    tefilla: m.tefilla,
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    hostName: m.hostName,
    committedMen: m.committedMen,
    status: m.status,
    missingForReady: m.missingForReady,
    rolesFilled: m.rolesFilled,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}
