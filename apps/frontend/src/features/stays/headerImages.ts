/**
 * Curated, self-hosted location-card header photos (public/headers/). Sourced from Pixabay under the
 * Pixabay Content License — free for commercial use, no attribution required — and downloaded +
 * self-hosted (per the API terms; no CDN hotlinking). They're DECORATIVE and varied (continents /
 * climates / city types), not the literal place, and are picked deterministically per stay so a
 * location keeps a stable image. If none match / an image fails to load, the SceneHeader shows.
 */
export const HEADER_IMAGES = [
  // Europe
  "/headers/eu-paris.jpg",
  "/headers/eu-london.jpg",
  "/headers/eu-prague.jpg",
  "/headers/eu-venice.jpg",
  "/headers/eu-amsterdam.jpg",
  "/headers/eu-alps.jpg",
  "/headers/europe-oldtown.jpg",
  // Americas
  "/headers/am-newyork.jpg",
  "/headers/am-sanfrancisco.jpg",
  "/headers/am-rio.jpg",
  "/headers/am-canada.jpg",
  "/headers/americas.jpg",
  // Far East
  "/headers/fe-tokyo.jpg",
  "/headers/fe-kyoto.jpg",
  "/headers/fe-hongkong.jpg",
  "/headers/fe-shanghai.jpg",
  "/headers/fe-bangkok.jpg",
  "/headers/fe-singapore.jpg",
  "/headers/asia.jpg",
  // Africa / South Africa
  "/headers/af-capetown.jpg",
  "/headers/af-safari.jpg",
  "/headers/af-marrakech.jpg",
  // General landscapes / cities
  "/headers/skyline.jpg",
  "/headers/mountains.jpg",
  "/headers/gen-lake.jpg",
  "/headers/coast.jpg",
  "/headers/tropical.jpg",
  "/headers/desert.jpg",
  "/headers/countryside.jpg",
  "/headers/autumn.jpg",
  "/headers/winter.jpg",
  "/headers/jerusalem.jpg",
] as const;

/** Stable djb2 hash → non-negative int (matches SceneHeader's, so image + scene stay in sync). */
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Region buckets keyed off the stay's COORDINATES (numeric — avoids the he/en country-name mess),
 * so a trip's cities show coherent, fitting imagery instead of a random world mishmash.
 */
export const REGION_IMAGES: Record<string, readonly string[]> = {
  europe: ["/headers/eu-paris.jpg", "/headers/eu-london.jpg", "/headers/eu-prague.jpg", "/headers/eu-venice.jpg", "/headers/eu-amsterdam.jpg", "/headers/eu-alps.jpg", "/headers/europe-oldtown.jpg"],
  americas: ["/headers/am-newyork.jpg", "/headers/am-sanfrancisco.jpg", "/headers/am-rio.jpg", "/headers/am-canada.jpg", "/headers/americas.jpg"],
  fareast: ["/headers/fe-tokyo.jpg", "/headers/fe-kyoto.jpg", "/headers/fe-hongkong.jpg", "/headers/fe-shanghai.jpg", "/headers/fe-bangkok.jpg", "/headers/fe-singapore.jpg", "/headers/asia.jpg"],
  africa: ["/headers/af-capetown.jpg", "/headers/af-safari.jpg", "/headers/af-marrakech.jpg"],
  mideast: ["/headers/jerusalem.jpg", "/headers/desert.jpg"],
};

/** Coarse region from lat/lng via bounding boxes (order matters — first match wins). */
function regionOf(lat: number, lng: number): keyof typeof REGION_IMAGES | null {
  if (lng >= -170 && lng <= -30) return "americas";
  if (lng >= 95 && lng <= 155) return "fareast";
  if (lat >= 12 && lat <= 42 && lng >= 25 && lng <= 63) return "mideast";
  if (lat >= 36 && lng >= -11 && lng <= 45) return "europe";
  if (lat >= -37 && lat < 36 && lng >= -20 && lng <= 52) return "africa";
  return null;
}

/**
 * The header photo for a stay. With coordinates it picks deterministically from the matching
 * region bucket (coherent per trip); without coords (manual city) it picks from the full set.
 */
export function pickHeaderImage(seed: string, lat?: number | null, lng?: number | null): string {
  const region = lat != null && lng != null ? regionOf(lat, lng) : null;
  const pool = region ? REGION_IMAGES[region]! : HEADER_IMAGES;
  return pool[hash(seed) % pool.length]!; // modulo keeps the index in range
}
