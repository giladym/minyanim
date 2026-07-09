# Implementation Plan: Kosher Places & Map Layers (+ Admin Foundation)

**Branch**: `010-kosher-places` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-kosher-places/spec.md` (Clarified — D1–D10).

## Summary

Give a signed-in traveler the **kosher/Jewish infrastructure** around a Stay (or an entered
location) — synagogues, kosher restaurants, Chabad houses, mikvehs (extensible) — as a **list** and a
**toggleable, clustered map layer**, with one-tap **Google Maps / Waze** navigation. The catalogue is
a generic **`place`** model grouped by **admin-managed `layer`**s (D1); the existing
`beit_chabad_pin` table is **generalized into `place`** under a migrated "Chabad houses" layer, then
dropped (D6). Admins curate the data through a new **admin surface** guarded by a reusable **admin
foundation** (D2): an admin capability on `user`, an **env-allowlist**-bootstrapped first admin, and
a server-side **`requireAdmin`** guard built on the existing `requireUserId`. A staged, re-runnable,
**dev-only importer** (`tools/places-import/`) bulk-populates places from OpenStreetMap/Overpass with
**source + license tracked per record** (D3/D4/D5), mirroring the existing `tools/seed-import/`
pipeline.

Technical spine: two new tables (`layer`, `place`) + an admin field on `user` + one migration (create
+ data-migrate `beit_chabad_pin` rows → drop); a **`placesService`/`placesRepository`** whose near-me
query reuses the **003 bbox** pattern (`bboxFrom` + indexed lat/lng scan); public read endpoints
(`GET /api/places`, `GET /api/layers`) + admin CRUD endpoints (`/api/admin/layers`, `/api/admin/places`)
behind `requireAdmin`; shared Zod contracts in `packages/shared`; a frontend places view (list +
`PlacesMap` with MapLibre clustering) + an admin shell; and a Node-built-ins importer tool. No cron.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 — unchanged.

**Primary Dependencies**: Hono, Drizzle, Zod v4, better-auth (extend `user.additionalFields` with the
admin field), TanStack Router/Query, react-i18next, Tailwind v4, **MapLibre GL** (already a FE dep
`^4.7.1`; add native **marker clustering** via a GeoJSON source + `cluster: true`, reusing the
`DiscoveryMap` lazy-import + MapTiler-tile + attribution seam). Importer: **Node built-ins only**
(`node:fs`, `fetch`, `node:test`) like `tools/seed-import/` — Overpass over `fetch`, **no new runtime
deps**. Reuse `lib/timezone`? Not needed here (no zmanim). Reuse the server-side MapTiler **geocoder**
(`GEO_MODE`) for coordinate validation during import (D-assumption).

**Storage**: Cloudflare D1 (SQLite) via Drizzle. **Two new tables** (`layer`, `place`) + one
**ADD COLUMN** on `user` (`is_admin`). One migration (next number **`0010`** — assigned at
`db:generate` time): create tables + indexes, **copy `beit_chabad_pin` rows into a "Chabad houses"
layer as `place`s**, then **DROP `beit_chabad_pin`** (this repo permits destructive dev migrations —
see MEMORY `dev-no-real-data`). Import artifacts are **files on disk**, never DB rows.

**Testing**: vitest-pool-workers (bbox near-me query grouped-by-layer; `requireAdmin` 403 for
non-admins / 200 for allowlisted admins; layer + place CRUD; retired-layer places hidden; attribution
present on every DTO; the beit-chabad data migration preserves rows). Vitest + Testing Library
(places list, layer toggles, place detail + navigate deep links, empty/coordless states, admin
manager forms). `node --test` for the importer (fetch→raw, map+validate, gate/dedupe/flag, dry-run
diff, idempotent upsert). Playwright + axe-core (places view + admin surface WCAG 2.1 AA, SC-003).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo.

**Performance Goals**: `GET /api/places` p95 < 200 ms (single indexed bbox scan, no network on the
read path — SC-001); map stays responsive at **200+ places** via client-side clustering (SC-004);
`cache-control` on the read (places are institutional/public data — mirrors `/api/config`).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (FR-007/FR-015/SC-003) — the **list is the a11y source
of truth**, the map is an enhancement that degrades to nothing when tiles/network fail; i18n-only
strings; tokens-only colors; admin allowlist is a **secret via `env` binding** (docs/secrets.md);
navigation uses **public deep links only** (no map-provider API/key/cost — D8); every displayed place
**carries source + license and renders required attribution** (D5/FR-013/SC-008).

**Scale/Scope**: worldwide institutional catalogue (importer-fed, human-curated); 3 user stories;
2 public read endpoints + 6 admin CRUD endpoints + 1 admin field; 2 new tables + 1 destructive
migration; new backend service/repository/controllers/routes; new FE places view + admin shell; a new
`tools/places-import/` tool; 1 ADR (admin foundation).

## Admin foundation (D2/FR-008)

The app has **no admin capability today**. This feature adds the minimal, reusable foundation that
**006 Admin** will extend (moderation/metrics stay in 006):

- **Capability on `user`**: an `isAdmin` boolean column (`text`/`boolean` mode, default `false`),
  registered in `apps/backend/src/auth.ts` better-auth `user.additionalFields` exactly like
  `language`/`theme`/`sharePhone` (so it round-trips and is never client-writable via profile update —
  it is **not** in `updateProfileSchema`). One privilege level ("admin") in this feature.
- **Env allowlist bootstrap** (no self-promotion): a new secret `ADMIN_EMAILS` (comma-separated) on
  `Env`. The `requireAdmin` guard treats a signed-in user whose **verified email** is on the allowlist
  as admin **even if** `user.isAdmin` is still `false`, and (idempotently) promotes the row on first
  admin request — so the **first** admin is set purely by configuring the secret + signing in; no DB
  edit or code change. 006 later adds admin-managed grants on top of `isAdmin`.
- **`requireAdmin` guard** (`apps/backend/src/lib/auth.ts`): `const userId = await requireUserId(c)`
  → load the user row → if `isAdmin` **or** email ∈ allowlist → return `userId` (promote if needed);
  else throw `Forbidden()` (**403** `auth.forbidden`, a new error code). All `/api/admin/*` routes
  call it; non-admins are refused at the API, not merely hidden (SC-006).
- **Admin route surface + UI shell**: a root-guarded `/admin` layout (its own `beforeLoad` calls
  `GET /api/admin/me` → 403 → redirect to `/stays`) hosting `AdminLayersManager` + `AdminPlacesManager`.
  It is a **shell** intended to host future 006 controls; nav entry appears only for admins.

## Place / layer model (D1/D6/FR-001/FR-002)

- **Generalize `beit_chabad_pin` → `place`.** `beit_chabad_pin` is already a static, admin-curated,
  non-user-owned pin table (`name/address/phone/city/country/lat/lng`) — exactly a degenerate
  `place`. Rather than special-case Chabad, we make one generic model carrying the union of source
  fields (name, coords, description, images, address, phone, hours, kosher metadata, provenance) and
  let a `layer` express the category. This kills the discovery-only `beitChabad` special path (its
  `beitChabadInBbox` query + `BeitChabadPinDTO` seam can later fold into places; **out of scope here**
  beyond the data migration — discovery keeps working off the migrated rows only if we keep the query,
  so v1 **retains** `beitChabadInBbox` reading from `place` under the Chabad layer OR leaves discovery
  untouched by keeping the table until 011 — see Complexity Tracking).
- **`place` belongs to exactly one `layer`** (`place.layer_id` FK, NOT NULL). Retiring a layer sets
  `layer.active = false` (places hidden/relabelled, never orphaned — edge case); **deleting** a layer
  is refused while it has places (or cascades per data-model decision). See data-model.md.
- **Data migration** copies each `beit_chabad_pin` row into a seeded **"Chabad houses"** layer as a
  `place` (source `"beit_chabad_seed"`, license `"internal"`), preserving details (FR-010), then
  **drops** `beit_chabad_pin` (destructive dev migration permitted).

## Near-me query (reuses the 003 bbox pattern)

`GET /api/places?lat&lng&radiusKm?` reuses **`bboxFrom(lat,lng,radiusKm)`** (already in
`discoveryService.ts`) + the indexed `place_lat_lng_idx` scan — the same convention as
`activeStaysInBbox`/`beitChabadInBbox` (assumption: "nearby reuses the 003 radius/bbox"). The service
loads active-layer places in the bbox, **groups by layer**, and returns them with the layer list +
attribution. Coordless input → a clear empty/degraded state (mirrors 005 zmanim's coordless handling,
edge case). Only places under **active** layers whose **license permits display** are returned (D5).

## Map layer + clustering + accessible list (D7/FR-007)

- **`PlacesMap`** mirrors `DiscoveryMap`'s lazy `import("maplibre-gl")` + MapTiler-tile-key
  (`GET /api/config`) + attribution seam, but uses a **GeoJSON source with `cluster: true`** (native
  MapLibre clustering) + `circle`/`symbol` cluster layers so dense areas (200+, SC-004) stay
  performant. One source per active layer (or a single source with a `layer`-keyed property + toggled
  filter) drives **layer toggles** (FR-004) by `setLayoutProperty(visibility)`.
- **The list is the a11y source of truth** (FR-007/SC-003): a keyboard/SR-operable `PlacesList`
  renders the same grouped-by-layer places; layer toggles affect **both**; the feature is fully
  usable with the map absent (tile key missing / tiles fail → map renders nothing, list remains).
  Every place row + marker popup shows the layer's required **attribution**.

## Navigation deep links (D8/FR-006/SC-002)

One tap from a place detail, **no map-provider API**:

- **Google Maps**: `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (or
  `...&query=<lat>,<lng>(<url-encoded name>)`); directions variant
  `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`.
- **Waze**: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes` (universal link; opens the app or web).

Both are built FE-side from the place's `lat`/`lng` (+ name), `target="_blank" rel="noopener"`,
`aria-label`ed, ≥44px.

## Staged importer architecture (`tools/places-import/`, D3/D4/D5/FR-011..014)

Mirrors `tools/seed-import/` (Node ≥ 22 built-ins, `node:test`, staged artifacts, **dev-only, never
CI/prod**). Each stage writes a reviewable JSON artifact before anything touches D1:

```
  Overpass query (area) ──▶ fetch ──▶ raw.json                        ← STEP 1
                                        │  (raw OSM elements, source + source id per element)
                                        ▼
                                     map + schema-validate ──▶ mapped.json     ← STEP 2
                                        │  (Zod → the shared place-import contract; per-record errors)
                                        ▼
                                     gate / dedupe / flag ──▶ accepted.json + rejected.json  ← STEP 3
                                        │  (missing coords → flag; dup by source id; dup by proximity;
                                        │   unresolvable location via the app geocoder; license check)
                                        ▼
                                     dry-run report ──▶ dryrun.json            ← STEP 4  (--dry-run)
                                        │  (would-create vs would-update, matched by source id)
                                        ▼
                                     upsert into dev D1  ← STEP 5  (idempotent by (source, source_id))
```

- **Source + license per record** (D5): each accepted record carries `source="openstreetmap"`,
  `source_id="<osm type/id>"`, `license="ODbL-1.0"`; records whose license forbids display/storage
  are dropped (Google Places is **live-lookup only, never seeded** — D3). Attribution string
  (`© OpenStreetMap contributors`) is recorded so the UI can render it (SC-008).
- **Idempotent upsert** by the unique `(source, source_id)` index (re-run updates, never duplicates —
  SC-007); **proximity dedupe** flags near-identical places across pulls (FR-012 / edge case).
- **Dev-scoped writes** (FR-014): the upsert refuses production unless an explicit
  `--allow-prod` + a prod-target flag is passed (default dev D1 via `wrangler d1 execute --local` or a
  bound dev connection), mirroring seed-import's "runs locally, against DEV only" posture.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ | New `placesController`/`placesService`/`placesRepository` + `adminController` reusing existing layering; near-me reuses `bboxFrom`. |
| Contract-first (shared Zod → DTOs + FE) | ✅ | `PlaceDTO`, `LayerDTO`, `PlacesResponse`, admin inputs (`CreateLayerInput`, `CreatePlaceInput`, …) in `packages/shared`. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | FR-007/FR-015/SC-003: list is the a11y source of truth, map an enhancement; axe-verified; RTL. |
| i18n-only strings, tokens-only colors | ✅ | New he/en keys (places + admin); no hardcoded colors; map popups use `var(--…)` tokens (as `DiscoveryMap` does). |
| Secrets via env bindings only | ✅ | `ADMIN_EMAILS` allowlist is a secret on `Env` (`.dev.vars`/`wrangler secret`); no map-provider key added (deep links only). |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse the logger; thin service; importer is Node built-ins only. |
| Edge-first, no high-latency round trips | ✅ | Read path is a single indexed bbox scan, no network (SC-001); geocode only at **import** time (offline tool). |
| Server-side geo containment | ✅ | Coordinate resolution/geocoding stays server-side / in the offline importer; the client only receives coords + builds public deep links. |

**Result**: PASS — no principle violations. The notable additions are an **admin capability**
(mirrors the `language`/`theme`/`sharePhone` additionalFields pattern) and a **generalized place
model absorbing `beit_chabad_pin`** — both deliberate and in scope. One scoping note (discovery's
`beitChabad` path vs the migrated table) is recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-kosher-places/
├── plan.md            # This file
├── spec.md            # Feature spec (D1–D10, FR-001..015, SC-001..008)
├── data-model.md      # Phase 1 — place + layer tables, admin field, migration
├── contracts/
│   └── api.md         # Phase 1 — public + admin endpoints, DTOs, error codes
└── tasks.md           # Phase 2 — the T0## task checklist
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/place.ts          # NEW: PlaceDTO, LayerDTO, PlacesResponse, PlacesQuery (Zod),
│                             #      CreateLayerInput/UpdateLayerInput, CreatePlaceInput/UpdatePlaceInput,
│                             #      KosherMeta ({certification?, agency?, dietary?: "meat"|"dairy"|"parve"})
├── schemas/index.ts (extend) # export * from "./place"
└── errors.ts (extend)        # AUTH_FORBIDDEN = "auth.forbidden"; LAYER_HAS_PLACES = "layer.has_places";
                              #   LAYER_NAME_TAKEN = "layer.name_taken"

apps/backend/src/
├── db/schema.ts (extend)     # NEW `layer` + `place` tables (place_lat_lng_idx, place_layer_idx,
│                             #   place_source_uidx unique(source, source_id)); user += isAdmin;
│                             #   REMOVE `beit_chabad_pin` (dropped in the migration)
├── ../migrations/0010_*.sql  # apps/backend/migrations/ (drizzle out): CREATE layer + place + indexes;
│                             #   INSERT the "Chabad houses" layer; INSERT ... SELECT beit_chabad_pin → place;
│                             #   DROP TABLE beit_chabad_pin. VERIFY generated SQL; hand-author the data-copy
│                             #   + DROP (drizzle-kit won't emit the data migration).
├── auth.ts (extend)          # register `isAdmin` in better-auth user.additionalFields (input:false)
├── env.ts (extend)           # ADMIN_EMAILS?: string (comma-separated allowlist secret)
├── lib/auth.ts (extend)      # requireAdmin(c): requireUserId → user row → isAdmin || email∈allowlist
│                             #   → (promote) return userId, else throw Forbidden()
├── lib/errors.ts (extend)    # Forbidden() → 403 auth.forbidden
├── repositories/placesRepository.ts  # placesInBbox(db, bbox) grouped-ready; listLayers; layer CRUD;
│                             #   place CRUD; upsertPlaceBySource (importer idempotency)
├── services/placesService.ts # nearPlaces(db, lat, lng, radiusKm): bboxFrom + placesInBbox → group by
│                             #   active layer + attribution; layer/place admin ops
├── controllers/placesController.ts   # hand-build PlacesResponse / PlaceDTO / LayerDTO
├── controllers/adminController.ts    # layer + place create/update/delete → DTOs
├── routes/places.ts          # GET /api/places, GET /api/layers (auth-guarded, cache-control)
├── routes/admin.ts           # /api/admin/* (all behind requireAdmin), GET /api/admin/me
├── index.ts (extend)         # app.route("/", places); app.route("/", admin)
└── repositories/discoveryRepository.ts (touch) # beitChabadInBbox: retire OR repoint at place (Cx note)

apps/frontend/src/
├── lib/places.ts             # usePlaces(lat,lng,radiusKm) + useLayers() queries; admin mutations
│                             #   (useCreateLayer/…, useCreatePlace/…) + useAdminMe()
├── features/places/PlacesView.tsx     # list + map, layer toggles, coordless/empty states
├── features/places/PlacesList.tsx     # a11y source of truth: grouped-by-layer, keyboard/SR
├── features/places/PlacesMap.tsx      # MapLibre GeoJSON clustered layer (mirrors DiscoveryMap seam)
├── features/places/PlaceDetail.tsx    # fields + Google Maps/Waze deep links + attribution
├── features/places/navLinks.ts        # googleMapsUrl(lat,lng,name) / wazeUrl(lat,lng)
├── features/admin/AdminLayout.tsx     # /admin shell (guard via useAdminMe → redirect)
├── features/admin/AdminLayersManager.tsx  # create/rename/reorder/retire layers
├── features/admin/AdminPlacesManager.tsx  # create/edit/delete places, assign layer (reuse LocationPicker precise)
├── router.tsx (extend)       # /admin layout + children; a places route (or embed in a Stay detail)
├── components/AppShell.tsx (extend)   # admin nav entry (admins only)
└── i18n/locales/{he,en}.ts (extend)   # places.* + admin.* keys (he/en parity)

tools/places-import/          # dev-only; Node ≥ 22 built-ins; node:test (mirrors tools/seed-import)
├── README.md                 # staged pipeline + dev-only/prod-authorization note
└── src/
    ├── overpass.ts           # build + fetch an Overpass query for an area → raw elements (STEP 1)
    ├── fetch.ts              # write raw.json
    ├── map.ts                # OSM element → place-import record (Zod validate) → mapped.json (STEP 2)
    ├── gate.ts               # coords/license/dedupe(source id + proximity) → accepted/rejected (STEP 3)
    ├── upsert.ts             # dry-run diff (STEP 4) + idempotent upsert by (source, source_id) (STEP 5)
    └── *.test.ts             # node --test: map, gate/dedupe, dry-run diff, idempotency

docs/adr/
└── 0011-admin-foundation.md  # admin capability + env-allowlist bootstrap + requireAdmin (reused by 006)
```

**Structure Decision**: Web two-app monorepo (unchanged). New `places` + `admin` backend
service/controllers/routes reusing the 003 bbox + better-auth additionalFields patterns; a FE places
view (list-first, MapLibre-clustered map enhancement) + an admin shell; a `tools/places-import/` tool
mirroring `tools/seed-import/`. All contracts in `packages/shared`.

## Complexity Tracking

| Item | Why it exists | Simpler alternative rejected because |
|------|---------------|--------------------------------------|
| Generalizing `beit_chabad_pin` → `place` + dropping the table | D6/FR-010: one generic catalogue instead of a per-category table; unblocks admin-managed layers | Keeping a parallel Chabad table would fork the read/admin/import paths and re-introduce the enum-vs-data problem D1 rejects. |
| Discovery's `beitChabad`/`beitChabadInBbox` path vs the dropped table | Discovery (003) still queries `beit_chabad_pin` | v1 repoints `beitChabadInBbox` at `place` (Chabad layer) so discovery keeps working; fully folding discovery into the places layer is deferred (011) to keep this feature scoped to the places surface + admin foundation. |
| Env-allowlist admin bootstrap (not a DB-only role) | FR-008: first admin with **no self-promotion, no DB edit, no code change** | A pure DB `isAdmin` flag has a chicken-and-egg bootstrap (who sets the first one?); the allowlist secret is the constitution-compliant answer (secrets via `env`). |
