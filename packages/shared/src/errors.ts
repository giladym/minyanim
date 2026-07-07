/**
 * Stable, language-agnostic error codes returned by the API. The frontend i18n layer
 * renders the user-facing text (he/en). Fleshed out in task T011.
 */
export const ERROR_CODES = {
  AUTH_REQUIRED: "auth.required",
  AUTH_EMAIL_UNVERIFIED: "auth.email_unverified",
  RATE_LIMITED: "rate.limited",
  RESOURCE_NOT_FOUND: "resource.not_found",
  SERVER_ERROR: "server.error",
  // 002 — Stays.
  LOCATION_REQUIRED: "location.required",
  DATE_IN_PAST: "date.in_past",
  DATE_RANGE_INVALID: "date.range_invalid",
  NUM_MEN_TOO_LOW: "num_men.too_low",
  NUM_MEN_TOO_HIGH: "num_men.too_high",
  CONFIRM_REQUIRED: "confirm.required",
  GEO_UNAVAILABLE: "geo.unavailable",
  GEO_INVALID_COORDS: "geo.invalid_coords",
  // 003 — Discovery & Quorum.
  COMMITMENT_DUPLICATE: "commitment.duplicate",
  COMMITMENT_CONFLICT: "commitment.conflict",
  ROLE_ALREADY_CLAIMED: "role.already_claimed",
  MINYAN_CANCELLED: "minyan.cancelled",
  MINYAN_COMPLETED: "minyan.completed",
  PARTY_SIZE_INVALID: "party_size.invalid",
  NOT_COMMITTED: "not_committed",
  EVENT_TIME_INVALID: "event.time_invalid",
  // 004 — Folders & History.
  FOLDER_NAME_TAKEN: "folder.name_taken",
  FOLDER_NAME_REQUIRED: "folder.name_required",
  FOLDER_NAME_TOO_LONG: "folder.name_too_long",
  STAY_NOT_CANCELLED: "stay.not_cancelled",
  // 008 — In-app messaging.
  MESSAGE_SELF: "message.self",
  MESSAGE_OPTED_OUT: "message.opted_out",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

/** One field-level error; `field` is null for non-field errors. */
export interface ApiFieldError {
  field: string | null;
  code: ErrorCode;
  params?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  errors: ApiFieldError[];
}
