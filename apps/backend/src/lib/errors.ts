import { ERROR_CODES, type ApiErrorResponse, type ErrorCode } from "@minyanim/shared";

/** Application error carrying an HTTP status + stable, localizable error code(s). */
export class AppError extends Error {
  readonly status: number;
  readonly errors: ApiErrorResponse["errors"];

  constructor(status: number, code: ErrorCode, field: string | null = null) {
    super(code);
    this.status = status;
    this.errors = [{ field, code }];
  }

  toResponse(): ApiErrorResponse {
    return { errors: this.errors };
  }
}

export const Unauthorized = () => new AppError(401, ERROR_CODES.AUTH_REQUIRED);
export const Forbidden = () => new AppError(403, ERROR_CODES.AUTH_FORBIDDEN);
export const NotFound = () => new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND);
export const RateLimited = () => new AppError(429, ERROR_CODES.RATE_LIMITED);
