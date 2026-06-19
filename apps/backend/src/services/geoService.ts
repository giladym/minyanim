import { GeoResultSchema, ERROR_CODES, type GeoResult, type GeoSearchResponse } from "@minyanim/shared";
import { AppError } from "../lib/errors";
import type { Env } from "../env";

/** Required attribution rendered by the client wherever results/map appear (D1). */
const ATTRIBUTION = "© MapTiler © OpenStreetMap contributors";
/** UA substring the MapTiler geocoding key is locked to (see docs/integrations/maptiler-setup.md). */
const USER_AGENT = "Minyanim-Server/1.0";
/** Cache TTL for geocoding responses (~24h) to control provider cost/quota. */
const CACHE_TTL_SECONDS = 86_400;

/** Minimal shape of a MapTiler geocoding feature we consume. */
interface MapTilerFeature {
  text?: string;
  place_name?: string;
  center?: [number, number];
  context?: Array<{ id?: string; text?: string }>;
}

/** Injectable fetch — lets tests stub the provider without a live call (D14). */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface SearchDeps {
  fetch?: FetchFn;
}

/** Canned result returned when GEO_MODE=mock (e2e/dev) — no network call. */
function mockResponse(): GeoSearchResponse {
  return {
    results: [
      { city: "London", country: "United Kingdom", lat: 51.5074, lng: -0.1278, label: "London, United Kingdom" },
    ],
    attribution: ATTRIBUTION,
  };
}

/** Derive a country name from a MapTiler feature's context array, if present. */
function countryOf(feature: MapTilerFeature): string {
  const country = feature.context?.find((c) => (c.id ?? "").startsWith("country"));
  return country?.text ?? "";
}

/** Normalize a provider feature to our internal GeoResult, or null if it lacks coordinates. */
function normalize(feature: MapTilerFeature): GeoResult | null {
  const center = feature.center;
  if (!center || center.length < 2) return null;
  const candidate = {
    city: feature.text ?? "",
    country: countryOf(feature),
    lat: center[1],
    lng: center[0],
    label: feature.place_name ?? feature.text ?? "",
  };
  const parsed = GeoResultSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Forward-geocode a free-text place query via MapTiler (server-side; D1). Caches successful
 * responses in the Cloudflare Cache API (~24h, keyed by normalized q+lang) and throws
 * `502 geo.unavailable` on provider failure so the UI can degrade to manual entry.
 *
 * @param env Worker env (provides MAPTILER_API_KEY + GEO_MODE).
 * @param q Free-text search (only the city box is ever sent — never the private address; D1).
 * @param lang UI language for result bias ("he" | "en").
 * @param deps Optional injectable `fetch` (tests stub the provider).
 * @returns Normalized results + the required attribution string.
 */
export async function searchPlaces(
  env: Env,
  q: string,
  lang: string,
  deps: SearchDeps = {},
): Promise<GeoSearchResponse> {
  if (env.GEO_MODE === "mock") return mockResponse();

  const doFetch = deps.fetch ?? (globalThis.fetch.bind(globalThis) as FetchFn);
  const language = lang === "en" ? "en" : "he";
  const normalizedQ = q.trim().toLowerCase();

  // Cache key: a stable synthetic URL from q+lang (cache is per-account, not per-real-URL).
  const cacheKey = new Request(`https://geo.cache/search?q=${encodeURIComponent(normalizedQ)}&lang=${language}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return (await cached.json()) as GeoSearchResponse;

  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json` +
    `?key=${env.MAPTILER_API_KEY}&language=${language}&country=il&limit=5&types=municipality,municipal_district,locality,place`;

  let providerResponse: Response;
  try {
    providerResponse = await doFetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    throw new AppError(502, ERROR_CODES.GEO_UNAVAILABLE);
  }
  if (!providerResponse.ok) {
    throw new AppError(502, ERROR_CODES.GEO_UNAVAILABLE);
  }

  let body: { features?: MapTilerFeature[] };
  try {
    body = (await providerResponse.json()) as { features?: MapTilerFeature[] };
  } catch {
    throw new AppError(502, ERROR_CODES.GEO_UNAVAILABLE);
  }

  const results = (body.features ?? [])
    .map(normalize)
    .filter((r): r is GeoResult => r !== null);
  const response: GeoSearchResponse = { results, attribution: ATTRIBUTION };

  // Cache the normalized response (best-effort; never fail the request on a cache error).
  try {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` },
      }),
    );
  } catch {
    // ignore cache write failures
  }

  return response;
}
