import { ERROR_CODES, type ApiErrorResponse, type ErrorCode } from "@minyanim/shared";

/** Application error carrying an HTTP status + stable, localizable error code(s). */
export class AppError extends Error {
  readonly status: number;
  readonly errors: ApiErrorResponse["errors"];

  constructor(status: number, code: ErrorCode, field: string | null = null, params?: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.errors = [{ field, code, ...(params ? { params } : {}) }];
  }

  toResponse(): ApiErrorResponse {
    return { errors: this.errors };
  }
}

export const Unauthorized = () => new AppError(401, ERROR_CODES.AUTH_REQUIRED);
export const Forbidden = () => new AppError(403, ERROR_CODES.AUTH_FORBIDDEN);
export const NotFound = () => new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND);
export const RateLimited = () => new AppError(429, ERROR_CODES.RATE_LIMITED);

// 006 — sanctions & enforcement.
/** Cannot sanction the last active admin (FR-009). 409 so the UI can distinguish it from a 403. */
export const LastAdmin = () => new AppError(409, ERROR_CODES.ADMIN_LAST_ADMIN);
/** A banned user cannot create content (FR-010). */
export const UserBanned = () => new AppError(403, ERROR_CODES.USER_BANNED);
/** A suspended user cannot create content until `until` (epoch-ms) — carried for the UI countdown. */
export const UserSuspended = (until: number) => new AppError(403, ERROR_CODES.USER_SUSPENDED, null, { until });

// 012 — media uploads.
/** Upload is not a real JPEG/PNG/WebP (magic-byte sniff). */
export const ImageTypeInvalid = () => new AppError(400, ERROR_CODES.IMAGE_TYPE_INVALID, "file");
/** Upload exceeds the max byte size. */
export const ImageTooLarge = () => new AppError(400, ERROR_CODES.IMAGE_TOO_LARGE, "file");
/** The gallery is already at its max image count. */
export const ImageGalleryFull = () => new AppError(409, ERROR_CODES.IMAGE_GALLERY_FULL, "file");
