# Research: Beit Chabad → Places Consolidation

All "unknowns" were resolved by reading the existing 003/010 code rather than external research; this
is a consolidation of already-shipped models. Decisions below.

## D1 — Reconciliation strategy (legacy pin → place)

**Decision**: A migration-time `INSERT … SELECT … WHERE NOT EXISTS` copies any `beit_chabad_pin` not
already present as a place (matched on the provenance the 010 migration used: `source='beit_chabad_seed'`,
`source_id = <legacy pin id>`), then `DROP TABLE beit_chabad_pin`.

**Rationale**: The 010 migration (`0010_black_lester.sql`) already copied every then-existing pin into
`layer_chabad_houses` with exactly that provenance. Re-selecting `WHERE NOT EXISTS` is a safe no-op if the
copy is complete and self-heals any pin added to the legacy table after 010. Doing it inside the same
migration that drops the table guarantees no window where a pin exists only in the legacy store.

**Alternatives considered**: (a) A one-off dev script instead of a migration — rejected: migrations are
the versioned, reviewable, re-runnable mechanism and CI/other envs need the same reconciliation. (b) Trust
010's copy and drop blindly — rejected: no safety net for post-010 legacy inserts; the `WHERE NOT EXISTS`
guard costs nothing.

## D2 — Dedupe rule

**Decision**: Primary key for dedupe is provenance `(source, source_id)`, enforced by the existing
`place_source_uidx` unique index — a second copy of the same legacy pin cannot be inserted. Proximity is a
secondary, advisory check only for records that lack shared provenance (e.g., a future OSM import of the
same building), surfaced by the 010 importer's existing proximity flag rather than enforced in SQL.

**Rationale**: `(source, source_id)` is deterministic and already unique in the schema, so idempotency is
structural, not procedural. Proximity matching is heuristic and belongs in the importer's review stage
(010), not in a destructive migration.

**Alternatives considered**: Proximity-merge in the migration — rejected: fuzzy matching in a destructive
step risks collapsing genuinely-distinct nearby houses; keep it advisory upstream.

## D3 — Discovery data source after consolidation

**Decision**: `discoveryService` drops `beitChabadInBbox` and instead reuses the generic
`placesInBbox(db, bbox)` (active layers only) + `listActiveLayers(db)` from 010's `placesRepository`, and
returns `places: PlaceDTO[]` + `layers: LayerDTO[]` on `DiscoveryResult` (replacing
`beitChabad: BeitChabadPinDTO[]`). This is the identical query the `/places` view already uses.

**Rationale**: Removes the last bespoke Chabad code path (FR-007) and unifies discovery with the places
view on one query + one DTO. `placesInBbox` already joins `layer` and filters `layer.active = true`, so a
retired layer hides its places consistently (spec edge case). Attribution is carried per-place on
`PlaceDTO.attribution` (010), preserving FR-009.

**Alternatives considered**: (a) Keep a Chabad-filtered place query on discovery — rejected: still a
bespoke path; the generic query is no more expensive and generalizes. (b) Remove Chabad from discovery
entirely (only in `/places`) — rejected: violates the "no discovery regression" constraint (FR-006).

**Scope note**: Because the query is now generic, ANY active layer with places in the viewport will show
on the discovery map, not only Chabad houses. Today only the Chabad layer is seeded, so there is no visible
change; going forward this is the intended unified behavior (kosher restaurants/mikvehs would appear as
their own toggleable layers). This is consistent with "Chabad houses as just another layer."

## D4 — Discovery map rendering

**Decision**: `DiscoveryMap` renders place markers grouped by `layerId`, with a per-layer visibility
toggle and the informational popup (name/address/phone) it shows today. Marker color comes from a token
(the Chabad layer keeps its gold-equivalent token; other layers get distinct tokens). The travelers +
minyanim layers are unchanged.

**Rationale**: Reuses the existing marker/popup machinery in `DiscoveryMap`; the only new concept is
"group markers by layer + toggle," mirroring the `/places` view's layer toggles (010 US1). Keeps the
screen-reader list-alongside-map a11y pattern.

**Alternatives considered**: Full MapLibre clustered-source reuse from `PlacesMap` inside `DiscoveryMap` —
deferred: heavier refactor than the marker-grouping approach and not required for zero-regression at
current data volumes; can be revisited if place density grows.

## D5 — Seed data

**Decision**: Repoint `apps/backend/seed/beit-chabad.sql` to seed the Chabad **layer + places** (with
`source='beit_chabad_seed'`) instead of the dropped `beit_chabad_pin` table; keep it idempotent via
`INSERT … ON CONFLICT DO NOTHING` on `place_source_uidx`. The layer row is already created by the 010
migration.

**Rationale**: The dev seed must not target a dropped table. Seeding `place` directly keeps local dev and
the reconciliation consistent and idempotent (FR-004/SC-004).

**Alternatives considered**: Delete the seed file — rejected: local dev still wants sample Chabad houses on
the map; keep it, retargeted.

## D6 — i18n / removed strings

**Decision**: Reuse the existing `discovery.beitChabad*` labels for the Chabad layer's display where still
shown; remove any string that becomes dead after the DTO change, keeping he/en parity (the parity test
gates this). Layer names come from data (`layer.name`), not i18n, so no per-layer string explosion.

**Rationale**: Layer names are admin-managed data; only fixed UI chrome (toggle labels, popup "info" note)
stays in i18n. Parity test enforces no orphaned keys.
