/**
 * STEP 4/5 — emit reviewable SQL: ensure a layer per key, then an IDEMPOTENT upsert of each place
 * keyed on the unique (source, source_id) index (re-running updates, never duplicates — SC-007). The
 * operator applies it with `wrangler d1 execute` (local by default; --remote is the explicit
 * prod-authorization step). Pure + testable; no DB connection here.
 */
import type { LayerKey, PlaceRecord } from "./map.ts";

const LAYER_META: Record<LayerKey, { id: string; name: string; order: number }> = {
  // Reuse the id feature 011 created so imported Chabad houses merge into the existing layer
  // (INSERT OR IGNORE is a no-op when the id already exists) rather than making a duplicate.
  chabad: { id: "layer_chabad_houses", name: "Chabad houses", order: 5 },
  worship: { id: "lyr_osm_worship", name: "Synagogues", order: 10 },
  restaurants: { id: "lyr_osm_restaurants", name: "Kosher restaurants", order: 20 },
  shops: { id: "lyr_osm_shops", name: "Kosher shops", order: 25 },
  cemeteries: { id: "lyr_osm_cemeteries", name: "Jewish cemeteries", order: 40 },
  mikvehs: { id: "lyr_osm_mikvehs", name: "Mikvehs", order: 30 },
};

/** SQL literal: NULL for null/undefined, else a single-quoted string with quotes doubled. */
function lit(v: string | null): string {
  return v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}
function num(v: number): string {
  return String(v);
}
const placeId = (sourceId: string) => `plc_osm_${sourceId.replace(/[^a-zA-Z0-9]/g, "_")}`;

/** Build the full upsert script for the accepted records. */
export function toUpsertSql(accepted: PlaceRecord[]): string {
  const lines: string[] = [
    "-- places-import (010 US3) — generated. Apply with:",
    "--   wrangler d1 execute minyanim --local  --file=upsert.sql   (dev)",
    "--   wrangler d1 execute minyanim --remote --file=upsert.sql   (prod — explicit authorization)",
    "PRAGMA foreign_keys=ON;",
  ];

  // Layers used by this batch (INSERT OR IGNORE — never clobbers an admin-renamed layer).
  const usedLayers = [...new Set(accepted.map((r) => r.layer))];
  for (const key of usedLayers) {
    const m = LAYER_META[key];
    lines.push(
      `INSERT OR IGNORE INTO layer (id,name,display_order,active,created_at,updated_at) ` +
        `VALUES (${lit(m.id)},${lit(m.name)},${m.order},1,unixepoch(),unixepoch());`,
    );
  }

  for (const r of accepted) {
    const cols = "id,layer_id,name,description,lat,lng,address,phone,hours,source,source_id,license,attribution,created_at,updated_at";
    const vals = [
      lit(placeId(r.sourceId)), lit(LAYER_META[r.layer].id), lit(r.name), "NULL",
      num(r.lat), num(r.lng), lit(r.address), lit(r.phone), lit(r.hours),
      lit(r.source), lit(r.sourceId), lit(r.license), lit(r.attribution), "unixepoch()", "unixepoch()",
    ].join(",");
    lines.push(
      `INSERT INTO place (${cols}) VALUES (${vals}) ` +
        `ON CONFLICT(source,source_id) DO UPDATE SET ` +
        `name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,` +
        `phone=excluded.phone,hours=excluded.hours,layer_id=excluded.layer_id,` +
        `attribution=excluded.attribution,updated_at=unixepoch();`,
    );
  }
  return lines.join("\n") + "\n";
}
