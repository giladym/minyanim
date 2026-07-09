# Phase 1 Data Model — Kosher Places & Map Layers (+ Admin Foundation)

Date: 2026-07-09 · Storage: Cloudflare D1 (SQLite) via Drizzle. **Two new tables** (`layer`,
`place`) + one **ADD COLUMN** on `user` (admin capability), and a **destructive migration** that
generalizes `beit_chabad_pin` into `place` then drops it (this repo permits destructive dev
migrations — MEMORY `dev-no-real-data`). Import artifacts are **files on disk**, never DB rows.

---

## New table — `layer` (D1/FR-002)

An admin-managed category grouping places (worship, restaurants, Chabad houses, mikvehs, …). Not a
code enum — admins add/rename/reorder/retire without a deploy (SC-005). Not user-owned.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | app-generated id |
| name | text NOT NULL | display name; per-name uniqueness enforced by a NOCASE unique index (migration) |
| icon | text NULL | marker/label icon key (a token, e.g. `"synagogue"`) |
| displayOrder | integer NOT NULL default 0 | admin reordering (`layer.display_order`) |
| active | integer(boolean) NOT NULL default true | **retired** = `false`: its places are hidden/relabelled, never orphaned (edge case) |
| createdAt / updatedAt | integer(timestamp) NOT NULL | |

Drizzle (`apps/backend/src/db/schema.ts`):

```ts
export const layer = sqliteTable("layer", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  displayOrder: integer("display_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => [index("layer_order_idx").on(t.displayOrder)]);
// Per-name case-insensitive uniqueness via a raw NOCASE unique index in the migration (Drizzle
// can't express COLLATE — same trick as folder.name, 004).
```

## New table — `place` (D6/D9/FR-001)

The generic kosher/Jewish location, absorbing `beit_chabad_pin`. Belongs to exactly one `layer`
(cannot exist without one — FR-002). Rich, best-effort fields (D9); missing fields degrade gracefully
and never hide a place with at least a name + coordinates.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | app-generated id |
| layerId | text NOT NULL FK → layer.id | `ON DELETE RESTRICT` (a layer with places can't be deleted; retire instead) |
| name | text NOT NULL | required |
| description | text NULL | best-effort |
| lat | real NOT NULL | required (a place needs coords — bbox scan + navigation) |
| lng | real NOT NULL | required |
| address | text NULL | |
| phone | text NULL | |
| hours | text NULL | opening hours (raw string, e.g. OSM `opening_hours`) |
| images | text(json) NULL | `string[]` image URLs (typed JSON, like `prayer_needs`) |
| kosherMeta | text(json) NULL | `KosherMeta` — `{ certification?, agency?, dietary?: "meat"\|"dairy"\|"parve" }` (D9) |
| source | text NOT NULL | provenance, e.g. `"openstreetmap"`, `"beit_chabad_seed"`, `"manual"` |
| sourceId | text NULL | source's stable id (OSM `type/id`); NULL for manual entries |
| license | text NOT NULL | e.g. `"ODbL-1.0"`, `"internal"`; records whose license forbids display are never stored (D5) |
| attribution | text NULL | required attribution string to render (e.g. `"© OpenStreetMap contributors"`) |
| createdAt / updatedAt | integer(timestamp) NOT NULL | |

Indexes:
- `place_lat_lng_idx` on `(lat, lng)` — the **003 bbox** near-me scan.
- `place_layer_idx` on `(layerId)` — group/filter by layer.
- `place_source_uidx` **UNIQUE** on `(source, sourceId)` — **idempotent importer upsert** (SC-007);
  partial/NULL-`sourceId` manual rows are exempt (SQLite treats multiple NULLs as distinct).

```ts
export const place = sqliteTable("place", {
  id: text("id").primaryKey(),
  layerId: text("layer_id").notNull().references(() => layer.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  address: text("address"),
  phone: text("phone"),
  hours: text("hours"),
  images: text("images", { mode: "json" }).$type<string[]>(),
  kosherMeta: text("kosher_meta", { mode: "json" }).$type<KosherMeta>(),
  source: text("source").notNull(),
  sourceId: text("source_id"),
  license: text("license").notNull(),
  attribution: text("attribution"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("place_lat_lng_idx").on(t.lat, t.lng),
  index("place_layer_idx").on(t.layerId),
  uniqueIndex("place_source_uidx").on(t.source, t.sourceId),
]);
```

## Change to `user` — admin capability (D2/FR-008)

`user` gains:

```ts
isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false)
```

Round-trip/registration touch-points (mirror `language`/`theme`/`sharePhone`):
1. `apps/backend/src/db/schema.ts` — the column above.
2. `apps/backend/src/auth.ts` — register in better-auth `user.additionalFields`:
   `isAdmin: { type: "boolean", required: false, defaultValue: false, input: false }`. **`input:false`**
   — it must **never** be client-writable (it is deliberately absent from `updateProfileSchema`).
3. The `requireAdmin` guard is the **only** writer (idempotent allowlist promotion) — see contracts.

## Relationships & ON DELETE

- `place.layer_id → layer.id` : **`ON DELETE RESTRICT`**. A layer with places cannot be deleted
  (`409 layer.has_places`); the admin **retires** it (`active=false`) instead — its places are hidden
  from the user view and relabelled in admin (edge case: no orphans, no deletes).
- No user ownership on `place`/`layer` (public institutional data — D10); nothing cascades from
  `user` here. `user.is_admin` is a plain column.

## Migration (`apps/backend/migrations/0010_*.sql`)

A real migration number is assigned at `db:generate` time (**next is `0010`**). `drizzle-kit generate`
emits the CREATE TABLEs + indexes; the **data copy + DROP must be hand-authored** (drizzle-kit won't
produce a data migration). Intended contents, in order:

1. `CREATE TABLE layer (...)` + `layer_order_idx` + the NOCASE-unique name index.
2. `CREATE TABLE place (...)` + `place_lat_lng_idx` + `place_layer_idx` + `place_source_uidx`.
3. `ALTER TABLE user ADD COLUMN is_admin integer NOT NULL DEFAULT 0;` — **VERIFY** this is a single
   `ALTER` and **not** a PRAGMA-wrapped table rebuild (`user` is a better-auth table with many FK
   children; D1 rejects the PRAGMA — the same trap 004/005 hit). Hand-author the one-line ALTER if
   drizzle-kit emits a rebuild.
4. Seed the **"Chabad houses"** layer: `INSERT INTO layer (id, name, icon, display_order, active, ...)
   VALUES ('layer_chabad', 'Chabad houses', 'chabad', 0, 1, ...);`
5. **Data-migrate** the pins: `INSERT INTO place (id, layer_id, name, lat, lng, address, phone,
   source, source_id, license, created_at, updated_at) SELECT id, 'layer_chabad', name, lat, lng,
   address, phone, 'beit_chabad_seed', id, 'internal', created_at, updated_at FROM beit_chabad_pin;`
   (preserves original ids + details — FR-010; `city`/`country` fold into `address` or drop).
6. `DROP TABLE beit_chabad_pin;` (destructive dev migration permitted).

Apply with `pnpm --filter @minyanim/backend db:migrate:local` (and `db:migrate:remote` on deploy —
CI does not auto-migrate). **Note for `discoveryRepository.beitChabadInBbox`**: after step 6 it must
read from `place` (filtered to the Chabad layer) or discovery breaks — repoint it (plan Complexity
Tracking).

## Import artifacts (tooling, not persisted app data — D4)

The staged JSON files under the importer's `--out` dir (mirrors seed-import's `raw.json`/`records.json`):

| Artifact | Stage | Contents |
|----------|-------|----------|
| `raw.json` | fetch | raw Overpass/OSM elements, each with source + source id |
| `mapped.json` | map + validate | records mapped to the place-import contract, Zod-validated, per-record errors |
| `accepted.json` | gate | records passing coords + license + dedupe gates (eligible to upsert) |
| `rejected.json` | gate | flagged records (missing coords, dup by source id/proximity, unresolvable location, bad license) with reasons |
| `dryrun.json` | dry-run | would-create vs would-update diff, matched by `(source, source_id)` — **no DB write** |

## Queries / derivation

- **Near-me** (`placesRepository.placesInBbox(db, bbox)`): `bboxFrom(lat, lng, radiusKm)` (reused
  from `discoveryService`) → indexed `place_lat_lng_idx` scan `WHERE lat/lng BETWEEN …`, joined to
  `layer` filtered to `active = true`; the service **groups by layer** and attaches each place's
  `attribution`. Coordless input → empty/degraded (no bbox).
- **Layers** (`listLayers`): all layers ordered by `display_order` (admin sees retired too; the user
  view filters to `active`).
- **Admin CRUD**: layer create/update(reorder/retire)/delete-if-empty; place create/update/delete;
  `upsertPlaceBySource` (`ON CONFLICT (source, source_id) DO UPDATE`) for the importer's idempotency.

## DTO boundary

- `PlaceDTO` = the full public place (id, layerId, name, description, lat, lng, address, phone, hours,
  images, kosherMeta, source, license, attribution) — all public institutional data (D10); no private
  fields exist. `LayerDTO` = id, name, icon, displayOrder, active. `PlacesResponse` = `{ layers,
  places-by-layer, attribution }` (see contracts). No fuzzing (unlike discovery minyanim — these are
  fixed institutions, and navigation needs the exact point).
- Admin inputs (`CreateLayerInput`, `CreatePlaceInput`, …) are Zod schemas in `packages/shared`; the
  admin guard is server-side (403), not a DTO concern.

## Tests (data-model-critical)

- **Bbox near-me**: places inside the bbox returned grouped by layer; outside excluded; retired-layer
  places excluded from the user view.
- **Layer delete guard**: deleting a layer with places → `409 layer.has_places`; retire → its places
  vanish from the user view.
- **Importer idempotency**: two upserts of the same `(source, source_id)` → 1 row (SC-007);
  proximity/duplicate flagged in `rejected.json`.
- **beit-chabad data migration**: after migration, the old pins are `place`s under "Chabad houses"
  with details preserved (FR-010); `beit_chabad_pin` is gone.
- **Attribution**: every returned `PlaceDTO` carries source + license and a renderable attribution
  (SC-008).
- **Admin field**: `isAdmin` defaults `false`, is not settable via `PATCH /api/me` (input:false).
