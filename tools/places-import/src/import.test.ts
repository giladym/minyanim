import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, parseBbox } from "./overpass.ts";
import { mapElement, mapElements } from "./map.ts";
import { gate } from "./gate.ts";
import { toUpsertSql } from "./sql.ts";

test("parseBbox + buildQuery target jewish worship / kosher diet / mikvah", () => {
  const b = parseBbox("48.8,2.3,48.9,2.4");
  assert.deepEqual(b, { south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
  const q = buildQuery(b);
  assert.match(q, /"religion"="jewish"/);
  assert.match(q, /"diet:kosher"~"yes\|only"/);
  assert.match(q, /"amenity"="mikvah"/);
});

test("mapElement classifies synagogues, kosher eateries, mikvehs; drops the rest", () => {
  const syn = mapElement({ type: "node", id: 1, lat: 48.8, lon: 2.3, tags: { name: "Grande Synagogue", amenity: "place_of_worship", religion: "jewish", "addr:street": "Rue X" } });
  assert.equal(syn?.layer, "worship");
  assert.equal(syn?.sourceId, "node/1");
  assert.equal(syn?.license, "ODbL-1.0");

  const rest = mapElement({ type: "way", id: 2, center: { lat: 48.81, lon: 2.31 }, tags: { name: "Pizza Kasher", amenity: "restaurant", "diet:kosher": "only" } });
  assert.equal(rest?.layer, "restaurants");
  assert.equal(rest?.lat, 48.81); // way uses center

  assert.equal(mapElement({ type: "node", id: 3, lat: 1, lon: 1, tags: { amenity: "place_of_worship", religion: "jewish" } }), null); // no name
  assert.equal(mapElement({ type: "node", id: 4, tags: { name: "X", amenity: "mikvah" } }), null); // no coords
  assert.equal(mapElement({ type: "node", id: 5, lat: 1, lon: 1, tags: { name: "Church", amenity: "place_of_worship", religion: "christian" } }), null); // not jewish
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
