/**
 * Public navigation deep links — no map-provider API/key/cost (010 D8). Both open the native app
 * when installed, else the web. Built from a place's coordinates ONLY.
 *
 * Google's `search?api=1` endpoint expects `query=<lat>,<lng>` — a bare coordinate pair drops a pin
 * at that exact point. Appending a `(name)` suffix makes Google treat the whole string as free-text
 * search (returning "no results" when the name doesn't resolve as a known place), so it is omitted.
 */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
