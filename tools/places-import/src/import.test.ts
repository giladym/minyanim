import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, parseBbox } from "./overpass.ts";
import { CATEGORIES } from "./categories.ts";
import { mapElement, mapElements } from "./map.ts";
import { gate } from "./gate.ts";
import { toUpsertSql } from "./sql.ts";

test("parseBbox parses south,west,north,east", () => {
  assert.deepEqual(parseBbox("48.8,2.3,48.9,2.4"), { south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
  assert.throws(() => parseBbox("1,2,3"), /expected/);
});

test("CATEGORIES cover jewish worship / kosher diet / shops / cemeteries / mikvah", () => {
  const all = CATEGORIES.flatMap((c) => c.selectors).join(" ");
  assert.match(all, /"religion"="jewish"/);
  assert.match(all, /"diet:kosher"~"yes\|only"/);
  assert.match(all, /"shop"/);
  assert.match(all, /"landuse"="cemetery"/);
  assert.match(all, /"amenity"="mikvah"/);
  assert.match(all, /chabad\|lubavitch/i);
  assert.deepEqual(CATEGORIES.map((c) => c.key), ["chabad", "worship", "restaurants", "shops", "cemeteries", "mikvehs"]);
});

test("buildQuery appends a bbox when given one, and is global when null", () => {
  const sel = ['nwr["amenity"="mikvah"]'];
  const scoped = buildQuery(sel, { south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
  assert.match(scoped, /nwr\["amenity"="mikvah"\]\(48\.8,2\.3,48\.9,2\.4\);/);
  assert.match(scoped, /timeout:60/);
  const global = buildQuery(sel, null);
  assert.match(global, /nwr\["amenity"="mikvah"\];/); // no bbox suffix
  assert.doesNotMatch(global, /\(48\.8/);
  assert.match(global, /timeout:300/); // generous timeout for a planet-wide scan
});

test("mapElement classifies synagogues, kosher eateries, mikvehs; drops the rest", () => {
  const syn = mapElement({ type: "node", id: 1, lat: 48.8, lon: 2.3, tags: { name: "Grande Synagogue", amenity: "place_of_worship", religion: "jewish", "addr:street": "Rue X" } });
  assert.equal(syn?.layer, "worship");
  assert.equal(syn?.sourceId, "node/1");
  assert.equal(syn?.license, "ODbL-1.0");

  const rest = mapElement({ type: "way", id: 2, center: { lat: 48.81, lon: 2.31 }, tags: { name: "Pizza Kasher", amenity: "restaurant", "diet:kosher": "only" } });
  assert.equal(rest?.layer, "restaurants");
  assert.equal(rest?.lat, 48.81); // way uses center

  const shop = mapElement({ type: "node", id: 6, lat: 48.8, lon: 2.3, tags: { name: "Kosher Butcher", shop: "butcher", "diet:kosher": "yes" } });
  assert.equal(shop?.layer, "shops"); // kosher retail, not an eatery

  const cemetery = mapElement({ type: "way", id: 7, center: { lat: 50.0, lon: 20.0 }, tags: { name: "Jewish Cemetery", landuse: "cemetery", religion: "jewish" } });
  assert.equal(cemetery?.layer, "cemeteries");
  const graveyard = mapElement({ type: "node", id: 8, lat: 50.0, lon: 20.0, tags: { name: "Old Bet Olam", amenity: "grave_yard", religion: "jewish" } });
  assert.equal(graveyard?.layer, "cemeteries");

  // Chabad wins over the generic synagogue layer, whether tagged by denomination or name.
  const chabadShul = mapElement({ type: "node", id: 10, lat: 40.7, lon: -74.0, tags: { name: "Chabad of Downtown", amenity: "place_of_worship", religion: "jewish" } });
  assert.equal(chabadShul?.layer, "chabad");
  const lubav = mapElement({ type: "node", id: 11, lat: 40.7, lon: -74.0, tags: { name: "Beit Menachem", amenity: "place_of_worship", religion: "jewish", denomination: "lubavitch" } });
  assert.equal(lubav?.layer, "chabad");

  assert.equal(mapElement({ type: "node", id: 3, lat: 1, lon: 1, tags: { amenity: "place_of_worship", religion: "jewish" } }), null); // no name
  assert.equal(mapElement({ type: "node", id: 4, tags: { name: "X", amenity: "mikvah" } }), null); // no coords
  assert.equal(mapElement({ type: "node", id: 5, lat: 1, lon: 1, tags: { name: "Church", amenity: "place_of_worship", religion: "christian" } }), null); // not jewish
  assert.equal(mapElement({ type: "node", id: 9, lat: 1, lon: 1, tags: { name: "Christian Cemetery", landuse: "cemetery", religion: "christian" } }), null); // not jewish
});

test("mapElements counts drops", () => {
  const r = mapElements([
    { type: "node", id: 1, lat: 1, lon: 1, tags: { name: "Shul", amenity: "place_of_worship", religion: "jewish" } },
    { type: "node", id: 2, lat: 1, lon: 1, tags: { amenity: "cafe" } },
  ]);
  assert.equal(r.records.length, 1);
  assert.equal(r.dropped, 1);
});

test("gate dedupes by source id and by proximity", () => {
  const base = { layer: "worship" as const, address: null, phone: null, hours: null, kosherDietary: null, source: "openstreetmap" as const, license: "ODbL-1.0" as const, attribution: "©" };
  const res = gate([
    { ...base, name: "Shul A", lat: 48.8, lng: 2.3, sourceId: "node/1" },
    { ...base, name: "Shul A", lat: 48.8, lng: 2.3, sourceId: "node/1" }, // same source id
    { ...base, name: "Shul A", lat: 48.80001, lng: 2.30001, sourceId: "node/2" }, // ~1m away, same name
    { ...base, name: "Shul B", lat: 49.0, lng: 2.5, sourceId: "node/3" }, // distinct
  ]);
  assert.equal(res.accepted.length, 2); // Shul A (node/1) + Shul B
  assert.deepEqual(res.rejected.map((r) => r.reason).sort(), ["duplicate_proximity", "duplicate_source_id"]);
});

test("toUpsertSql emits INSERT OR IGNORE layers + idempotent place upsert", () => {
  const sql = toUpsertSql([
    { name: "O'Hara's Shul", lat: 48.8, lng: 2.3, layer: "worship", address: null, phone: null, hours: null, kosherDietary: null, source: "openstreetmap", sourceId: "node/1", license: "ODbL-1.0", attribution: "© OpenStreetMap contributors" },
  ]);
  assert.match(sql, /INSERT OR IGNORE INTO layer .*'lyr_osm_worship'/);
  assert.match(sql, /ON CONFLICT\(source,source_id\) DO UPDATE SET/);
  assert.match(sql, /'O''Hara''s Shul'/); // single quotes doubled
  assert.match(sql, /'node\/1'/);
});
