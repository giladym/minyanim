/**
 * Central catalogue of the place categories the importer collects, each with the Overpass `nwr`
 * selectors that find it (WITHOUT a bbox/area suffix — that is appended per-query). Both the fetch
 * (overpass.ts) and the classifier (map.ts) derive from this list so a new layer is added in one place.
 *
 * Counts below are approximate global OSM totals (2026-07) — a sanity check, not a contract.
 */
export type LayerKey = "chabad" | "worship" | "restaurants" | "shops" | "cemeteries" | "mikvehs";

export interface Category {
  key: LayerKey;
  /** Overpass `nwr[...]` filters (no trailing bbox/area); multiple are unioned. */
  selectors: string[];
}

export const CATEGORIES: Category[] = [
  // Chabad houses — by denomination or a Chabad/Lubavitch name (~630 worldwide). Classified BEFORE
  // synagogues so a Chabad shul lands here, not in the generic Synagogues layer.
  {
    key: "chabad",
    selectors: [
      'nwr["denomination"~"chabad|lubavitch",i]',
      'nwr["name"~"[Cc]habad|[Ll]ubavitch"]',
    ],
  },
  // Synagogues — ~7.4k worldwide.
  { key: "worship", selectors: ['nwr["religion"="jewish"]["amenity"="place_of_worship"]'] },
  // Kosher eateries — diet:kosher on a food-service amenity.
  { key: "restaurants", selectors: ['nwr["diet:kosher"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"]'] },
  // Kosher shops — diet:kosher on a retail shop (butcher, bakery, supermarket…). ~900 worldwide.
  { key: "shops", selectors: ['nwr["diet:kosher"~"yes|only"]["shop"]'] },
  // Jewish cemeteries — ~5.9k worldwide (heritage). Two common taggings.
  {
    key: "cemeteries",
    selectors: [
      'nwr["religion"="jewish"]["landuse"="cemetery"]',
      'nwr["religion"="jewish"]["amenity"="grave_yard"]',
    ],
  },
  // Mikvehs — the amenity=mikvah tag is barely used (~2 worldwide); kept for completeness.
  { key: "mikvehs", selectors: ['nwr["amenity"="mikvah"]'] },
];
