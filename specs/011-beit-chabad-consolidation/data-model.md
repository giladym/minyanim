# Data Model: Beit Chabad → Places Consolidation

No new tables or columns. This feature **removes** one table and reuses the 010 `place`/`layer` model as
the single source of truth for Chabad houses.

## Entities

### `place` (010 — now the SoT for Chabad houses; unchanged)

Relevant columns (see `apps/backend/src/db/schema.ts`):

| Column | Notes |
|--------|-------|
| `id` (PK) | `place_…` |
| `layer_id` → `layer.id` (RESTRICT) | Chabad houses live under `layer_chabad_houses` |
| `name`, `lat`, `lng` | required; `lat/lng` real |
| `address`, `phone`, `description`, `hours` | best-effort nullable |
| `images` (json), `kosher_meta` (json) | nullable |
| `source`, `source_id` | provenance; **`UNIQUE(source, source_id)`** = idempotency + dedupe key |
| `license`, `attribution` | server-side provenance; `attribution` is the renderable string |
| `created_at`, `updated_at` | timestamps |

Indexes (existing): `place_lat_lng_idx(lat,lng)`, `place_layer_idx(layer_id)`,
`place_source_uidx(source, source_id)` UNIQUE.

Chabad-house rows carry `source='beit_chabad_seed'`, `source_id = <legacy pin id>` (set by the 010
migration). A future OSM/Overpass import of the same houses would use its own `(source, source_id)`; the
importer's proximity flag (010) is the advisory guard against real-world duplicates across sources.

### `layer` (010 — unchanged)

`layer_chabad_houses` ("Chabad houses", `icon='chabad'`, `active=true`) already exists (010 migration).
Admin-managed via the 010 places/layers manager; `active=false` hides its places consistently.

### `beit_chabad_pin` (legacy — REMOVED)

Dropped by migration 0012. Columns were `{id, name, address, phone, city, country, lat, lng, created_at,
updated_at}` — all representable on `place` (city/country were display-only on the legacy DTO and are not
needed for the map marker/popup, which use name/address/phone/coords). The Drizzle `beitChabadPin` export
is deleted from `schema.ts`.

## Migration 0012 (destructive — approved, pre-launch)

Two statements, in order (single migration so there is no window where a pin exists only in the legacy
store):

1. **Reconcile** — insert any legacy pin not already present as a place, matched on provenance:

   ```sql
   INSERT INTO place (id, layer_id, name, lat, lng, address, phone, source, source_id, license,
                      created_at, updated_at)
   SELECT 'place_' || p.id, 'layer_chabad_houses', p.name, p.lat, p.lng, p.address, p.phone,
          'beit_chabad_seed', p.id, 'internal', p.created_at, p.updated_at
   FROM beit_chabad_pin p
   WHERE NOT EXISTS (
     SELECT 1 FROM place x WHERE x.source = 'beit_chabad_seed' AND x.source_id = p.id
   );
   ```

   (Mirrors the 010 copy exactly; no-op when 010's copy is already complete.)

2. **Drop** — `DROP TABLE beit_chabad_pin;`

Hand-authored (Drizzle would not emit the data-copy step). `layer_chabad_houses` is guaranteed to exist
(created by the 010 migration), so the FK on `place.layer_id` holds. No FK children point at
`beit_chabad_pin`, so the drop is safe.

**Reconciliation safety (SC-001/SC-002)**: the `WHERE NOT EXISTS` guard means every legacy pin ends up as a
place exactly once — copied if missing, skipped if already copied. The `place_source_uidx` unique index is
the structural guarantee against duplicates.

## Contract change (shared)

`DiscoveryResult` (`packages/shared/src/schemas/discovery.ts`):

- **Remove**: `beitChabad: BeitChabadPinDTO[]` and the `BeitChabadPinDTO` interface.
- **Add**: `places: PlaceDTO[]` + `layers: LayerDTO[]` (reuse the 010 `place` schema types).

`attribution` on the result stays (now sourced from place provenance / the existing discovery attribution
string). See [contracts/discovery.md](./contracts/discovery.md).

## State & validation

No state machine. Validation is structural: `place_source_uidx` (idempotency/dedupe), `layer.active`
(visibility), FK `place.layer_id → layer.id` RESTRICT (a Chabad place cannot be orphaned).
