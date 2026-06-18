/** Worker bindings + secrets. Secrets resolved via env (see docs/secrets.md). */
export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  /** Public base URL of the app (frontend origin); used for auth callbacks/links. */
  APP_BASE_URL?: string;
  /** Cloudflare Rate Limiting binding (optional — present in deployed/configured envs). */
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  /** "false" disables email-verification gating (tests/dev test-auth path). Default: required. */
  REQUIRE_EMAIL_VERIFICATION?: string;
  /** "true" disables rate limiting (e2e only, to avoid shared-IP throttling). Default: on. */
  RATE_LIMIT_DISABLED?: string;
}
