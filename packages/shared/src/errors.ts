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
