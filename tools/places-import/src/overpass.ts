/**
 * STEP 1 — build + fetch an OpenStreetMap Overpass query. Open data (ODbL, attribution required).
 * A query is built from a set of `nwr` selectors (see categories.ts) plus an OPTIONAL bbox: with a
 * bbox it scans an area; without one (`null`) it runs a global, tag-indexed query — feasible here
 * because the Jewish/kosher tags are globally rare. Returns the raw `elements`; the fetch is
 * injectable so tests never hit the network.
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

export const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Parse "south,west,north,east" (the Overpass bbox order) into a Bbox. */
export function parseBbox(s: string): Bbox {
  const p = s.split(",").map((n) => Number(n.trim()));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) {
    throw new Error(`bad --bbox "${s}" — expected "south,west,north,east"`);
  }
  return { south: p[0], west: p[1], north: p[2], east: p[3] };
}

/**
 * Build Overpass QL from `nwr` selectors + an optional bbox. `nwr` = nodes+ways+relations; `out center`
 * gives a single coordinate for ways/relations. A global (bbox=null) query gets a generous timeout
 * since it scans the whole planet by tag. Selectors must NOT include their own bbox/area suffix.
 */
export function buildQuery(selectors: string[], bbox: Bbox | null): string {
  const suffix = bbox ? `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})` : "";
  const timeout = bbox ? 60 : 300;
  return [
    `[out:json][timeout:${timeout}];`,
    "(",
    ...selectors.map((s) => `  ${s}${suffix};`),
    ");",
    "out center tags;",
  ].join("\n");
}

/**
 * Fetch raw elements for a set of selectors + optional bbox. `endpoint` allows pointing at a mirror
 * (the main server rate-limits rapid/global queries); `fetchImpl` is injectable for tests.
 */
export async function fetchOverpass(
  selectors: string[],
  bbox: Bbox | null,
  opts: { endpoint?: string; fetchImpl?: typeof fetch } = {},
): Promise<OverpassElement[]> {
  const { endpoint = DEFAULT_OVERPASS_URL, fetchImpl = fetch } = opts;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Minyanim-Import/1.0" },
    body: `data=${encodeURIComponent(buildQuery(selectors, bbox))}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
  // Overpass reports server-side timeouts / capacity errors as HTTP 200 with a `remark` and no
  // elements — surfacing it as an error (rather than a silent empty) is essential for tiled/global
  // imports, where a swallowed timeout would look identical to "no places found".
  if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
    throw new Error(`Overpass remark: ${json.remark.trim()}`);
  }
  return json.elements ?? [];
}
