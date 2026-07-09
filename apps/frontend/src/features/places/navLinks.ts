/**
 * Public navigation deep links — no map-provider API/key/cost (010 D8). Both open the native app
 * when installed, else the web. Built from a place's coordinates (+ name for the Google label).
 */
export function googleMapsUrl(lat: number, lng: number, name?: string): string {
  const q = name ? `${lat},${lng}(${encodeURIComponent(name)})` : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
