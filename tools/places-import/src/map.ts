/**
 * STEP 2 — map raw Overpass elements to place-import records + validate. A record is kept only if it
 * has a name and coordinates and classifies into a known layer; everything else is dropped here (and
 * counted). Layer keys are logical (worship / restaurants / mikvehs) — resolved to layer rows at
 * upsert time. Pure + testable.
 */
import type { OverpassElement } from "./overpass.ts";

export type LayerKey = "worship" | "restaurants" | "mikvehs";

export interface PlaceRecord {
  name: string;
  lat: number;
  lng: number;
  layer: LayerKey;
  address: string | null;
  phone: string | null;
  hours: string | null;
  kosherDietary: "meat" | "dairy" | "parve" | null;
  source: "openstreetmap";
  sourceId: string; // "node/123", "way/456" — stable per OSM element
  license: "ODbL-1.0";
  attribution: string;
}

const ATTRIBUTION = "© OpenStreetMap contributors";

function classify(tags: Record<string, string>): LayerKey | null {
  if (tags.amenity === "mikvah") return "mikvehs";
  if (tags.amenity === "place_of_worship" && tags.religion === "jewish") return "worship";
  if (/restaurant|cafe|fast_food/.test(tags.amenity ?? "") && /yes|only/.test(tags["diet:kosher"] ?? "")) return "restaurants";
  return null;
}

function coordsOf(el: OverpassElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  return lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lng: lon } : null;
}

function address(tags: Record<string, string>): string | null {
  const parts = [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Map one element; returns null if it lacks a name/coords or doesn't classify. */
export function mapElement(el: OverpassElement): PlaceRecord | null {
  const tags = el.tags ?? {};
  const name = (tags.name ?? "").trim();
  const layer = classify(tags);
  const coords = coordsOf(el);
  if (!name || !layer || !coords) return null;
  return {
    name,
    lat: coords.lat,
    lng: coords.lng,
    layer,
    address: address(tags),
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    hours: tags.opening_hours ?? null,
    kosherDietary: null,
    source: "openstreetmap",
    sourceId: `${el.type}/${el.id}`,
    license: "ODbL-1.0",
    attribution: ATTRIBUTION,
  };
}

export interface MapResult {
  records: PlaceRecord[];
  dropped: number; // elements with no name / coords / classification
}

export function mapElements(elements: OverpassElement[]): MapResult {
  const records: PlaceRecord[] = [];
  let dropped = 0;
  for (const el of elements) {
    const r = mapElement(el);
    if (r) records.push(r);
    else dropped++;
  }
  return { records, dropped };
}
