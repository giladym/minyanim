/** Worker bindings + secrets. Secrets resolved via env (see docs/secrets.md). */
export interface Env {
  DB: D1Database;
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
}
