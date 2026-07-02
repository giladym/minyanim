/**
 * Public, client-safe runtime configuration (GET /api/config). Contains only values that are
 * safe to expose to the browser — currently the PUBLIC, origin-restricted MapTiler tile key, served
 * at runtime so the map works without a build-time env var (and survives key rotation without a
 * rebuild). Never put secrets here.
 */
export interface PublicConfig {
  /** MapTiler tile key for client-side map rendering ("" when unconfigured → map hidden). */
  maptilerTileKey: string;
}
