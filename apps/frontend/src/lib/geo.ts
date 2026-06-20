import type { GeoSearchResponse } from "@minyanim/shared";
import { api } from "./api";

/**
 * GET /api/geo/search — forward-geocode a place name (server-side; provider key stays on the
 * server). Returns normalized results + the required attribution string. Empty results are
 * valid (the UI offers manual city/country entry). The caller debounces (see LocationPicker).
 *
 * @param q   Free-text place query (only the city box is sent — never the private address, D1).
 * @param lang UI language used to bias provider results ("he" | "en").
 */
export function searchPlaces(q: string, lang: string): Promise<GeoSearchResponse> {
  const params = new URLSearchParams({ q, lang });
  return api<GeoSearchResponse>(`/geo/search?${params.toString()}`);
}

/** Address/POI-level forward geocoding for the minyan host flow (precise pin). */
export function searchPlacesPrecise(q: string, lang: string): Promise<GeoSearchResponse> {
  const params = new URLSearchParams({ q, lang, precise: "1" });
  return api<GeoSearchResponse>(`/geo/search?${params.toString()}`);
}

/**
 * GET /api/geo/reverse — reverse-geocode map coordinates to the nearest city-level place
 * (server-side). Powers click-to-pick on the confirmation map. Returns 0–1 results; an empty
 * list means no locality was found at that point (the UI prompts to pick again or enter manually).
 *
 * @param lat  Latitude of the clicked point.
 * @param lng  Longitude of the clicked point.
 * @param lang UI language used to localize result labels ("he" | "en").
 */
export function reverseGeocode(lat: number, lng: number, lang: string): Promise<GeoSearchResponse> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), lang });
  return api<GeoSearchResponse>(`/geo/reverse?${params.toString()}`);
}
