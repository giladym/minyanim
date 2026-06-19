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
