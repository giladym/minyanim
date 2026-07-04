/**
 * Curated, self-hosted location-card header photos (public/headers/). Sourced from Pixabay under the
 * Pixabay Content License — free for commercial use, no attribution required — and downloaded +
 * self-hosted (per the API terms; no CDN hotlinking). They're DECORATIVE and varied (continents /
 * climates / city types), not the literal place, and are picked deterministically per stay so a
 * location keeps a stable image. If none match / an image fails to load, the SceneHeader shows.
 */
export const HEADER_IMAGES = [
  "/headers/europe-oldtown.jpg",
  "/headers/skyline.jpg",
  "/headers/mountains.jpg",
  "/headers/coast.jpg",
  "/headers/desert.jpg",
  "/headers/autumn.jpg",
  "/headers/winter.jpg",
  "/headers/jerusalem.jpg",
  "/headers/tropical.jpg",
  "/headers/countryside.jpg",
  "/headers/asia.jpg",
  "/headers/americas.jpg",
] as const;

/** Stable djb2 hash → non-negative int (matches SceneHeader's, so image + scene stay in sync). */
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The header photo for a stay, chosen deterministically from the curated set. */
export function pickHeaderImage(seed: string): string {
  return HEADER_IMAGES[hash(seed) % HEADER_IMAGES.length]!; // modulo keeps the index in range
}
