/**
 * STEP 1 — build + fetch an OpenStreetMap Overpass query for an area. Open data (ODbL, attribution
 * required). Returns the raw `elements` array; the fetch is injectable so tests never hit the network.
 */

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Parse "south,west,north,east" (the Overpass bbox order) into a Bbox. */
export function parseBbox(s: string): Bbox {
  const p = s.split(",").map((n) => Number(n.trim()));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) {
    throw new Error(`bad --bbox "${s}" — expected "south,west,north,east"`);
  }
  return { south: p[0], west: p[1], north: p[2], east: p[3] };
}

/**
 * Overpass QL for kosher/Jewish places in a bbox: synagogues (religion=jewish worship), kosher-tagged
 * eateries (diet:kosher yes/only), and mikvehs. `nwr` = nodes+ways+relations; `out center` gives a
 * single coordinate for ways/relations.
 */
export function buildQuery(b: Bbox): string {
  const box = `(${b.south},${b.west},${b.north},${b.east})`;
  return [
    "[out:json][timeout:60];",
    "(",
    `  nwr["amenity"="place_of_worship"]["religion"="jewish"]${box};`,
    `  nwr["amenity"~"restaurant|cafe|fast_food"]["diet:kosher"~"yes|only"]${box};`,
    `  nwr["amenity"="mikvah"]${box};`,
    ");",
    "out center tags;",
  ].join("\n");
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Fetch raw elements for a bbox. `fetchImpl` is injectable for tests (default: global fetch). */
export async function fetchOverpass(b: Bbox, fetchImpl: typeof fetch = fetch): Promise<OverpassElement[]> {
  const res = await fetchImpl(OVERPASS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Minyanim-Import/1.0" },
    body: `data=${encodeURIComponent(buildQuery(b))}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };
  return json.elements ?? [];
}
