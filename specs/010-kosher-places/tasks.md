# Tasks: Kosher Places & Map Layers (+ Admin Foundation)

**Feature**: 010 · **Branch**: `010-kosher-places` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests included (constitution gate): vitest-pool-workers (backend), Vitest + Testing Library
(frontend), `node --test` (importer tool), Playwright + axe (WCAG AA). MVP = **US2 + US1** (admins can
curate places; users can discover them). US3 (bulk import) scales coverage after.

**Status: shipped** (PRs #35 foundational · #36 admin API · #37 admin UI · #38 user discovery ·
#39 importer). **Deferred to 011** (per plan Complexity Tracking): T008 was done as *retain* — the
migration COPIES `beit_chabad_pin` into a "Chabad houses" layer additively; the destructive **drop**
of the old table + folding discovery's Chabad query into `place` are left to a later feature, so 010
carries no data loss or discovery regression.

---

## Phase 1 — Setup

- [x] T001 Add shared contracts in `packages/shared/src/schemas/place.ts` — `PlaceDTO`, `LayerDTO`, `PlacesResponse`, `PlacesQuery`, `KosherMeta` ({certification?, agency?, dietary?: "meat"|"dairy"|"parve"}), `CreateLayerInput`/`UpdateLayerInput`, `CreatePlaceInput`/`UpdatePlaceInput`; export from `packages/shared/src/schemas/index.ts`.
- [x] T002 [P] Add error codes in `packages/shared/src/errors.ts`: `AUTH_FORBIDDEN="auth.forbidden"`, `LAYER_HAS_PLACES="layer.has_places"`, `LAYER_NAME_TAKEN="layer.name_taken"`.

## Phase 2 — Foundational (admin role + place/layer schema) — BLOCKS all stories

- [x] T003 Extend `apps/backend/src/db/schema.ts`: new `layer` (name, display_order, active, icon/label, timestamps) + `place` (layer_id FK NOT NULL, name, description, lat, lng, address, phone, hours, images json, kosher meta, source, source_id, license, timestamps) tables with `place_lat_lng_idx`, `place_layer_idx`, unique `place_source_uidx(source, source_id)`; add `user.isAdmin` (boolean, default false); mark `beit_chabad_pin` for removal.
- [x] T004 Generate migration (`pnpm --filter @minyanim/backend db:generate`) → `apps/backend/migrations/0010_*.sql`; then **hand-author** the data migration (drizzle won't): INSERT a "Chabad houses" `layer`, `INSERT ... SELECT` `beit_chabad_pin` → `place` (source `"beit_chabad_seed"`, license `"internal"`), `DROP TABLE beit_chabad_pin`. Apply local (`db:migrate:local`).
- [x] T005 Register `isAdmin` in `apps/backend/src/auth.ts` `user.additionalFields` with **`input:false`** (never settable via signup/profile).
- [x] T006 [P] Add `ADMIN_EMAILS?: string` to `apps/backend/src/env.ts` (comma-separated allowlist secret; document in `docs/secrets.md`).
- [x] T007 Add `Forbidden()` (403 `auth.forbidden`) to `apps/backend/src/lib/errors.ts`; add `requireAdmin(c)` to `apps/backend/src/lib/auth.ts` — `requireUserId` → load user → admin iff `isAdmin===true` OR verified email ∈ `ADMIN_EMAILS`; on allowlist hit, idempotently promote (`isAdmin=true`); else `throw Forbidden()`.
- [x] T008 Repoint or retain the discovery Chabad path in `apps/backend/src/repositories/discoveryRepository.ts` (`beitChabadInBbox`) so 003 keeps working off the migrated `place` rows (Complexity-Tracking decision).
- [x] T009 [P] Backend test `apps/backend/test/admin-guard.test.ts`: non-admin → 403 on an admin route; allowlisted email → promoted + allowed; `isAdmin` not settable via `PATCH /api/me`.

## Phase 3 — User Story 2: Admin manages layers & places (Priority: P1)

**Goal**: an allowlisted admin defines layers and CRUDs places; non-admins are refused. **Independent test**: admin creates a layer + a place → appears in US1; non-admin denied (UI + API).

- [x] T010 [US2] `apps/backend/src/repositories/placesRepository.ts` — layer CRUD (+ `LAYER_HAS_PLACES` guard on delete), place CRUD, `listLayers`, `upsertPlaceBySource`.
- [x] T011 [US2] `apps/backend/src/services/placesService.ts` (admin ops) + `apps/backend/src/controllers/adminController.ts` (→ DTOs).
- [x] T012 [US2] `apps/backend/src/routes/admin.ts` — `GET /api/admin/me`, `POST/PATCH/DELETE /api/admin/layers`, `POST/PATCH/DELETE /api/admin/places`, all behind `requireAdmin`; register in `apps/backend/src/index.ts`.
- [x] T013 [P] [US2] Backend test `apps/backend/test/admin-places.test.ts` — layer+place CRUD, `layer.has_places` on delete, `layer.name_taken`, 403 for non-admin.
- [x] T014 [US2] Frontend `apps/frontend/src/lib/places.ts` admin hooks (`useAdminMe`, `useCreateLayer`/`useUpdateLayer`/`useDeleteLayer`, `useCreatePlace`/…); `apps/frontend/src/features/admin/AdminLayout.tsx` (guard via `useAdminMe` → redirect).
- [x] T015 [US2] `apps/frontend/src/features/admin/AdminLayersManager.tsx` (create/rename/reorder/retire) + `AdminPlacesManager.tsx` (create/edit/delete, assign layer; reuse `LocationPicker` precise mode).
- [x] T016 [US2] Wire `/admin` layout + children in `apps/frontend/src/router.tsx`; admins-only nav entry in `apps/frontend/src/components/AppShell.tsx`; `admin.*` i18n keys (he/en).

## Phase 4 — User Story 1: Discover kosher places near me (Priority: P1)

**Goal**: a signed-in user sees nearby places as list + toggleable clustered map layer, opens details, navigates. **Independent test**: with places present near a location, they show in list + map; toggle works; detail + Google Maps/Waze links resolve.

- [x] T017 [US1] `placesRepository.placesInBbox(db, bbox)` + `placesService.nearPlaces(lat,lng,radiusKm)` — reuse `bboxFrom`, group by **active** layer, license-permitting only, + attribution; `controllers/placesController.ts` builds `PlacesResponse`.
- [x] T018 [US1] `apps/backend/src/routes/places.ts` — `GET /api/places?lat&lng&radiusKm?`, `GET /api/layers` (auth-guarded, cache-control); register in `index.ts`.
- [x] T019 [P] [US1] Backend test `apps/backend/test/places.test.ts` — bbox filter, group-by-layer, active-only, attribution present, coordless → empty.
- [x] T020 [US1] `apps/frontend/src/features/places/navLinks.ts` (`googleMapsUrl`, `wazeUrl`) + `PlaceDetail.tsx` (fields + nav links + attribution).
- [x] T021 [US1] `apps/frontend/src/features/places/PlacesList.tsx` (a11y source of truth, grouped by layer, keyboard/SR) + `PlacesView.tsx` (list + map + layer toggles + coordless/empty states); `usePlaces`/`useLayers` in `lib/places.ts`.
- [x] T022 [US1] `apps/frontend/src/features/places/PlacesMap.tsx` — MapLibre GeoJSON `cluster:true` layer mirroring `DiscoveryMap` seam; layer toggles via visibility; token-colored popups.
- [x] T023 [US1] Route/entry for the places view in `router.tsx` (+ entry from a Stay); `places.*` i18n keys (he/en).
- [x] T024 [P] [US1] Frontend test `apps/frontend/src/features/places/PlacesView.test.tsx` (list renders, toggle hides/shows, empty state) + `navLinks.test.ts` (correct Google/Waze URLs).

## Phase 5 — User Story 3: Bulk import from open sources (Priority: P2)

**Goal**: staged, re-runnable, dev-only importer populates places from OSM/Overpass. **Independent test**: run over a bbox → raw/mapped/accepted/rejected/dry-run artifacts → idempotent upsert (no dupes on re-run).

- [x] T025 [US3] `tools/places-import/src/overpass.ts` (build+fetch Overpass query → raw elements, STEP 1) + `map.ts` (STEP 2: → place-import Zod contract, per-record errors).
- [x] T026 [US3] `tools/places-import/src/gate.ts` (STEP 3: missing-coords flag, dedupe by source_id + proximity, geocode/coord validation, license check → accepted/rejected) + `report.ts` (STEP 4 `--dry-run`: would-create vs would-update).
- [x] T027 [US3] `tools/places-import/src/upsert.ts` (STEP 5: idempotent upsert by `(source, source_id)`, dev-scoped; `--allow-prod` gate) + `cli.ts` wiring the stages + `README.md`.
- [x] T028 [P] [US3] `node --test` in `tools/places-import/src/*.test.ts` (overpass mapping, gate dedupe/flags, idempotent upsert plan).

## Phase 6 — Polish & cross-cutting

- [x] T029 [P] i18n parity green (he/en) for all new `places.*` + `admin.*` keys.
- [x] T030 [P] Playwright + axe e2e: places view axe-clean (map present) + list-only operable; admin surface reachable by admin, 403 for non-admin.
- [x] T031 [P] Docs alignment: ADR for the admin foundation + places/import; update `CLAUDE.md` SPECKIT block, `ROADMAP.md`, `design/DESIGN-SYSTEM.md` (places/admin surfaces), `docs/architecture.md` (tools/places-import); mark tasks complete.

---

## Dependencies

- **Phase 2 blocks everything** (schema + admin guard + migration).
- **US2 (Phase 3) before US1 (Phase 4)** in practice — US1 needs places to exist (US2 creates them); but each is independently testable (US1 with seeded rows).
- **US3 (Phase 5)** depends only on the Phase 2 `place`/`layer` model + `upsertPlaceBySource`.
- Polish (Phase 6) last.

## Parallel opportunities

- T002 ∥ T001; T006 ∥ T005/T007; test tasks (T009, T013, T019, T024, T028) run alongside their siblings.
- Once Phase 2 lands, **US2, US1, and US3 backends can proceed in parallel** (distinct files); the importer (US3) is fully independent (tools/).

## Implementation strategy

1. **Foundational (Phase 2)** — the schema + admin guard + migration are the hard prerequisite; ship as the first reviewable slice (no UI).
2. **MVP = US2 + US1** — admin can curate a few places; users can discover them on the map/list. Deployable, demoable value.
3. **US3** — bulk-populate worldwide from OSM to scale coverage.
4. Each phase is its own PR (branch → PR → CI green incl. axe → merge → deploy → verify); migration 0010 applied to remote dev on deploy.
