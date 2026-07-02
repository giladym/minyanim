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

/** Context id prefixes that name a city-level locality (used to label address/POI results). */
const CITY_PREFIXES = ["municipality", "municipal_district", "locality", "place", "region"];

/** Best city name for a feature: a city-level context entry, else the feature's own text. For a
 * city result this is just `text`; for an address/POI result it's the enclosing municipality. */
function cityOf(feature: MapTilerFeature): string {
  const hit = feature.context?.find((c) => CITY_PREFIXES.some((p) => (c.id ?? "").startsWith(p)));
  return hit?.text ?? feature.text ?? "";
}

/** Normalize a provider feature to our internal GeoResult, or null if it lacks coordinates. */
function normalize(feature: MapTilerFeature): GeoResult | null {
  const center = feature.center;
  if (!center || center.length < 2) return null;
  const candidate = {
    city: cityOf(feature),
    country: countryOf(feature),
    lat: center[1],
    lng: center[0],
    label: feature.place_name ?? feature.text ?? "",
  };
  const parsed = GeoResultSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** City-level types (Stays; the private address is never geocoded — D1). */
const PLACE_TYPES = "municipality,municipal_district,locality,place";
/** Precise types (Minyanim): address/POI/street as well, so an exact venue resolves to a point. */
const PRECISE_PLACE_TYPES = "address,poi,street,municipality,municipal_district,locality,place";

/** Fetch features from a MapTiler geocoding URL, mapping any failure to `502 geo.unavailable`. */
async function fetchFeatures(doFetch: FetchFn, url: string): Promise<MapTilerFeature[]> {
  let providerResponse: Response;
  try {
    providerResponse = await doFetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    throw new AppError(502, ERROR_CODES.GEO_UNAVAILABLE);
  }
  if (!providerResponse.ok) {
    throw new AppError(502, ERROR_CODES.GEO_UNAVAILABLE);
  }
  try {
    const body = (await providerResponse.json()) as { features?: MapTilerFeature[] };
    return body.features ?? [];
  } catch {
    throw new AppError(502, ERROR_CODES.GEO_UNAVAILABLE);
  }
}

/** Read a cached GeoSearchResponse, or write one (best-effort — cache errors never fail the request). */
async function readCache(key: Request): Promise<GeoSearchResponse | undefined> {
  const cached = await caches.default.match(key);
  return cached ? ((await cached.json()) as GeoSearchResponse) : undefined;
}
async function writeCache(key: Request, response: GeoSearchResponse): Promise<void> {
  try {
    await caches.default.put(
      key,
      new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` },
      }),
    );
  } catch {
    // ignore cache write failures
  }
}

/**
 * Forward-geocode a free-text place query via MapTiler (server-side; D1). Caches successful
 * responses in the Cloudflare Cache API (~24h, keyed by normalized q+lang) and throws
 * `502 geo.unavailable` on provider failure so the UI can degrade to manual entry.
 *
 * Search is global in every UI language — the `language` param only localizes the returned
 * place labels, it does not restrict which places are searchable. (Minyanim is a travel product;
 * Hebrew-speaking users overwhelmingly search for destinations *outside* Israel.)
 *
 * @param env Worker env (provides MAPTILER_API_KEY + GEO_MODE).
 * @param q Free-text search (only the city box is ever sent — never the private address; D1).
 * @param lang UI language ("he" | "en"); localizes result labels only.
 * @param deps Optional injectable `fetch` (tests stub the provider).
 * @returns Normalized results + the required attribution string.
 */
export async function searchPlaces(
  env: Env,
  q: string,
  lang: string,
  deps: SearchDeps = {},
  precise = false,
): Promise<GeoSearchResponse> {
  if (env.GEO_MODE === "mock") return mockResponse();

  const doFetch = deps.fetch ?? (globalThis.fetch.bind(globalThis) as FetchFn);
  const language = lang === "en" ? "en" : "he";
  // Normalize once: the SAME query string drives the provider request and the cache key.
  const normalizedQ = q.trim().toLowerCase();
  const types = precise ? PRECISE_PLACE_TYPES : PLACE_TYPES;

  // Cache key: a stable synthetic URL from q+lang+precision (cache is per-account, not per-real-URL).
  const cacheKey = new Request(`https://geo.cache/search?q=${encodeURIComponent(normalizedQ)}&lang=${language}&p=${precise ? 1 : 0}`);
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(normalizedQ)}.json` +
    `?key=${env.MAPTILER_API_KEY}&language=${language}&limit=5&types=${types}`;

  const results = (await fetchFeatures(doFetch, url))
    .map(normalize)
    .filter((r): r is GeoResult => r !== null);
  const response: GeoSearchResponse = { results, attribution: ATTRIBUTION };

  await writeCache(cacheKey, response);
  return response;
}

/**
 * Reverse-geocode map coordinates to the nearest city-level place via MapTiler (server-side; D1).
 * Powers click-to-pick on the confirmation map. Returns 0–1 results (the most relevant locality);
 * an empty list is valid and the UI prompts the user to pick another point or enter manually.
 * Same caching/failure contract as {@link searchPlaces}.
 *
 * @param env Worker env (provides MAPTILER_API_KEY + GEO_MODE).
 * @param lat Latitude of the picked point.
 * @param lng Longitude of the picked point.
 * @param lang UI language ("he" | "en"); localizes result labels only.
 * @param deps Optional injectable `fetch` (tests stub the provider).
 */
export async function reverseGeocode(
  env: Env,
  lat: number,
  lng: number,
  lang: string,
  deps: SearchDeps = {},
): Promise<GeoSearchResponse> {
  if (env.GEO_MODE === "mock") return mockResponse();

  const doFetch = deps.fetch ?? (globalThis.fetch.bind(globalThis) as FetchFn);
  const language = lang === "en" ? "en" : "he";
  // Round to ~5 decimals (≈1m) so near-identical clicks share a cache entry.
  const rLat = lat.toFixed(5);
  const rLng = lng.toFixed(5);

  const cacheKey = new Request(`https://geo.cache/reverse?lat=${rLat}&lng=${rLng}&lang=${language}`);
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  // MapTiler reverse geocoding takes `{lng},{lat}`; limit=1 keeps the single best locality.
  const url =
    `https://api.maptiler.com/geocoding/${rLng},${rLat}.json` +
    `?key=${env.MAPTILER_API_KEY}&language=${language}&limit=1&types=${PLACE_TYPES}`;

  const results = (await fetchFeatures(doFetch, url))
    .map(normalize)
    .filter((r): r is GeoResult => r !== null);
  const response: GeoSearchResponse = { results, attribution: ATTRIBUTION };

  await writeCache(cacheKey, response);
  return response;
}
