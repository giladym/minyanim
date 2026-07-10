/** Worker bindings + secrets. Secrets resolved via env (see docs/secrets.md). */
export interface Env {
  DB: D1Database;
  /** 012: R2 bucket for uploaded image bytes (avatars / stay+minyan galleries / place photos).
   * Refs live on the parent D1 rows; keys are `{kind}/{parentId}/{uuid}.{ext}`. */
  IMAGES: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  /** MapTiler forward-geocoding key (server-side secret; never sent to the client). */
  MAPTILER_API_KEY: string;
  /** MapTiler map-TILE key — PUBLIC (origin-restricted, usage-capped). Served to the client at
   * runtime via GET /api/config so the map works without a build-time var (docs/maptiler-setup). */
  MAPTILER_TILE_KEY?: string;
  /** "live" calls MapTiler; "mock" returns canned geocoding results (e2e/dev). Default: live. */
  GEO_MODE?: string;
  /** Public base URL of the app (frontend origin); used for auth callbacks/links. */
  APP_BASE_URL?: string;
  /** Cloudflare Rate Limiting binding (optional — present in deployed/configured envs). */
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  /** "false" disables email-verification gating (tests/dev test-auth path). Default: required. */
  REQUIRE_EMAIL_VERIFICATION?: string;
  /** "true" disables rate limiting (e2e only, to avoid shared-IP throttling). Default: on. */
  RATE_LIMIT_DISABLED?: string;
  /** 010: comma-separated allowlist of admin emails (a secret). A signed-in user whose account email
   * is listed is idempotently promoted to admin by the guard — bootstraps the first admin with no
   * self-service promotion and no DB edit. */
  ADMIN_EMAILS?: string;
}
