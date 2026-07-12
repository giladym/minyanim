import {
  MinyanAttrsSchema,
  ATTRS_BY_CATEGORY,
  CATEGORY_META,
  ERROR_CODES,
  type Category,
  type EventType,
  type GatheringAttrs,
  type GatheringStatus,
  type MinyanAttrs,
  type MinyanService,
  type MinyanStatus,
  type RsvpMode,
} from "@minyanim/shared";
import { AppError } from "./errors";
import { deriveStatus, missingForReady, isCompleted, type ReadinessInput } from "./minyanStatus";

/**
 * Per-behavior strategy map (014 R1) — exactly TWO entries. A behavior (`event.type`) is the single
 * branch point for the pieces that are genuinely type-specific: readiness derivation, detail parse +
 * insert values, public-detail projection, whether the host self-attends (counts toward the
 * quorum/capacity), and the default RSVP mode. `minyan` wraps today's `lib/minyanStatus` verbatim
 * (SC-005 — no behavior change); `gathering` is the capacity/RSVP derivation, with per-category
 * defaults resolved via the shared `CATEGORY_META`.
 */

/** Shared derivation context (a superset — each strategy reads only the fields it needs). */
export interface ReadinessCtx extends ReadinessInput {
  /** Guest seats (gatherings); null = unlimited. Always null for a minyan (R12). */
  capacity: number | null;
  /** Confirmed guest party-size sum (gatherings). */
  confirmedPartySize: number;
}

/** Public type-specific detail slice merged onto the common DTO by `eventService.buildPublic`. */
export interface MinyanPublicDetail {
  nusach: MinyanAttrs["nusach"];
  seferTorah: boolean;
  services: MinyanService[];
  status: MinyanStatus;
}
export interface GatheringPublicDetail {
  attrs: GatheringAttrs;
  status: GatheringStatus;
  confirmedCount: number;
}

/** Gathering "full" derivation: full when the confirmed party-size sum ≥ capacity (R4). */
export function gatheringStatus(c: {
  storedStatus: string;
  eventDate: Date;
  lat: number;
  lng: number;
  capacity: number | null;
  confirmedPartySize: number;
}): GatheringStatus {
  if (c.storedStatus === "cancelled") return "cancelled";
  if (isCompleted(c.eventDate, c.lat, c.lng)) return "completed";
  if (c.capacity !== null && c.confirmedPartySize >= c.capacity) return "full";
  return "forming";
}

/** Seats left for guests: capacity − confirmed party-size sum; null when capacity is unlimited (R12). */
export function seatsRemaining(capacity: number | null, confirmedPartySize: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - confirmedPartySize);
}

export interface EventStrategyEntry {
  /** minyan = true (host self-commits, counts toward quorum); gathering = false (organizer, not a seat). */
  hostSelfAttends: boolean;
  /** Default RSVP mode when the create body omits it. Gathering resolves per category (CATEGORY_META). */
  defaultRsvpMode: (category: Category | null) => RsvpMode;
  /** Validate the wire detail block (`minyan` attrs, or `gathering` attrs by category). */
  detailParse: (raw: unknown, category: Category | null) => MinyanAttrs | GatheringAttrs;
  /** Detail-table insert values for `createEventBatch` (minyan → minyan row; gathering → gathering row). */
  detailInsertValues: (eventId: string, attrs: MinyanAttrs | GatheringAttrs) => Record<string, unknown>;
  /** Derive the surfaced status per behavior. */
  readiness: (c: ReadinessCtx) => MinyanStatus | GatheringStatus;
}

export const EVENT_STRATEGY: Record<EventType, EventStrategyEntry> = {
  minyan: {
    hostSelfAttends: true,
    defaultRsvpMode: () => "open",
    detailParse: (raw) => MinyanAttrsSchema.parse(raw),
    detailInsertValues: (eventId, attrs) => {
      const a = attrs as MinyanAttrs;
      return { eventId, nusach: a.nusach, seferTorah: a.seferTorah, services: a.services };
    },
    readiness: (c) => deriveStatus(c),
  },
  gathering: {
    hostSelfAttends: false,
    defaultRsvpMode: (category) =>
      category && category in CATEGORY_META
        ? CATEGORY_META[category as keyof typeof CATEGORY_META].defaultRsvpMode
        : "open",
    detailParse: (raw, category) => {
      const schema = category ? ATTRS_BY_CATEGORY[category as keyof typeof ATTRS_BY_CATEGORY] : undefined;
      if (!schema) throw new AppError(400, ERROR_CODES.CATEGORY_INVALID, "category");
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new AppError(400, ERROR_CODES.GATHERING_ATTRS_INVALID, "gathering");
      return parsed.data;
    },
    detailInsertValues: (eventId, attrs) => ({ eventId, attrs: attrs as GatheringAttrs }),
    readiness: (c) => gatheringStatus(c),
  },
};

/** Re-export so the minyan `missingForReady` is reachable via the strategy module (minyan-only). */
export { missingForReady };
