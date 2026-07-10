# Tasks: Beit Chabad → Places Consolidation

**Feature**: `specs/011-beit-chabad-consolidation/` | **Plan**: [plan.md](./plan.md) |
**Spec**: [spec.md](./spec.md)

**Organization**: by user story — US2 (single source of truth: migration + schema removal, P1) →
US1 (discovery shows Chabad via the generic places path, P1) → US3 (admin edits reflected, P2). A shared
contract change is foundational (it breaks compilation on both sides until updated). Tests are included
(the project's a11y + contract-first gates require them).

**Dependencies at a glance**: Setup → Foundational (contract) → US2 (data/migration) → US1 (discovery
repoint) → US3 (verify) → Polish. US1's service repoint depends on the Foundational contract; US2 is
data-only and can proceed in parallel with US1's frontend once the contract lands.

---

## Phase 1: Setup

- [x] T001 Create branch `011-beit-chabad-consolidation` off `develop`; confirm migrations 0001–0011 are applied locally (`pnpm --filter @minyanim/backend db:migrate:local`) and that `layer_chabad_houses` + its copied places exist (`wrangler d1 execute … "SELECT count(*) FROM place WHERE layer_id='layer_chabad_houses'"`).

---

## Phase 2: Foundational (BLOCKING — shared contract)

**Purpose**: The `DiscoveryResult` type change breaks both apps until updated; do it first so backend and
frontend compile against one contract.

- [x] T002 Update `packages/shared/src/schemas/discovery.ts`: remove `BeitChabadPinDTO` and `DiscoveryResult.beitChabad`; add `places: PlaceDTO[]` and `layers: LayerDTO[]` (import the 010 `PlaceDTO`/`LayerDTO` from the place schema). Keep `attribution`. JSDoc the change (amends 003 D18). Run `pnpm --filter @minyanim/shared typecheck`. (contracts/discovery.md)

**Checkpoint**: shared types compile; backend/frontend now have known compile errors to resolve in US1.

---

## Phase 3: User Story 2 — One source of truth for Chabad houses (Priority: P1)

**Goal**: Reconcile every legacy pin into `place`, then drop `beit_chabad_pin` and remove its schema
export; make the seed target `place`.

**Independent Test**: After migrating, `beit_chabad_pin` no longer exists and each prior pin is a place in
`layer_chabad_houses` exactly once; re-running the seed inserts nothing new.

- [x] T003 [US2] Hand-author `apps/backend/migrations/0012_*.sql` (destructive, approved): (1) `INSERT INTO place (…) SELECT 'place_'||p.id, 'layer_chabad_houses', p.name, p.lat, p.lng, p.address, p.phone, 'beit_chabad_seed', p.id, 'internal', p.created_at, p.updated_at FROM beit_chabad_pin p WHERE NOT EXISTS (SELECT 1 FROM place x WHERE x.source='beit_chabad_seed' AND x.source_id=p.id);` then (2) `DROP TABLE beit_chabad_pin;`. Add the `meta/` snapshot via `db:generate` if needed, or hand-maintain per prior destructive migrations. (data-model.md Migration 0012)
- [x] T004 [US2] Remove the `beitChabadPin` table export from `apps/backend/src/db/schema.ts` (and its now-dead comment); ensure nothing else in `schema.ts` references it.
- [x] T005 [US2] Retarget `apps/backend/seed/beit-chabad.sql` to seed the Chabad **places** (into `layer_chabad_houses`, `source='beit_chabad_seed'`, `source_id=<id>`, `license='internal'`) with `ON CONFLICT(source, source_id) DO NOTHING` (idempotent). Remove any `INSERT INTO beit_chabad_pin`.
- [x] T006 [P] [US2] `apps/backend/test/migration-0012.test.ts` (or extend an existing migration test): asserts `beit_chabad_pin` table is gone; a place exists in `layer_chabad_houses` for a known seeded id; a duplicate-source insert is a no-op (SC-001/002/004).
- [x] T007 [US2] Apply locally (`pnpm --filter @minyanim/backend db:migrate:local`) and run the seed twice to confirm idempotency (quickstart Scenario 2).

**Checkpoint**: legacy table gone, data consolidated, seed idempotent.

---

## Phase 4: User Story 1 — Chabad houses still appear on the discovery map (Priority: P1)

**Goal**: Repoint discovery at the generic places path and render place markers grouped by layer, with no
user-visible regression.

**Independent Test**: Open the discovery map over seeded Chabad houses → each renders (name/address/phone)
with attribution; toggling the Chabad layer hides/shows them; empty viewport → no error.

- [x] T008 [US1] `apps/backend/src/repositories/discoveryRepository.ts`: remove `beitChabadInBbox` and the `beitChabadPin` import; (the generic `placesInBbox` already lives in `placesRepository` — no new repo query needed). Keep `Bbox` export.
- [x] T009 [US1] `apps/backend/src/services/discoveryService.ts`: replace the `beitChabad` assembly in BOTH the discovery and near-stay result builders with `places` (from `placesInBbox(db, bbox)`) + `layers` (from `listActiveLayers(db)`), mapped via the 010 `toPlaceDTO`/`toLayerDTO`. Return `{ potential, minyanim, places, layers, attribution }`. (contracts/discovery.md, research D3)
- [x] T010 [P] [US1] `apps/backend/test/near-stay.test.ts` + `apps/backend/test/discovery.test.ts` (and `admin-places.test.ts` if it asserts the old shape): update assertions from `beitChabad` to `places`/`layers`; assert a seeded Chabad place appears in `places` within its bbox with its layerId, and an empty viewport returns `places: []` without error.
- [x] T011 [US1] `apps/frontend/src/features/discovery/DiscoveryMap.tsx`: replace the `beitChabad`/`BeitChabadPinDTO` props + gold-pin loop with a `places: PlaceDTO[]` + `layers: LayerDTO[]` render — group markers by `layerId`, per-layer visibility toggle (accessible name, keyboard, token color; Chabad keeps its gold-equivalent token), reuse the name/address/phone popup. Preserve the screen-reader list-alongside-map pattern.
- [x] T012 [US1] `apps/frontend/src/features/discovery/DiscoveryPage.tsx`: pass `data.places`/`data.layers` (drop `data.beitChabad`); render/keep the attribution note.
- [x] T013 [P] [US1] `apps/frontend/src/features/discovery/DiscoveryPage.test.tsx`: update the mocked discovery response to `places`/`layers`; assert a Chabad place renders and the layer toggle shows/hides it.
- [x] T014 [US1] Update `apps/frontend/src/i18n/locales/{he,en}.ts`: keep the Chabad layer chrome/popup labels needed by the new render; remove any `discovery.beitChabad*` key that is now unused; keep he/en parity (parity test must pass).

**Checkpoint**: discovery map shows Chabad houses via the generic places path, no regression.

---

## Phase 5: User Story 3 — Admin edits reflected everywhere (Priority: P2)

**Goal**: Confirm an admin edit to a Chabad place flows to the discovery map (single source of truth).

**Independent Test**: Edit a Chabad place via `/admin/places`, reopen discovery over its location, see the
edit.

- [x] T015 [P] [US3] `apps/backend/test/near-stay.test.ts` (or a small new test): after updating a Chabad place row, the discovery/near-stay `places` reflect the new name (proves one underlying record; no legacy divergence).
- [x] T016 [US3] Manual verify (quickstart Scenario 4) that an `/admin/places` edit appears on the discovery map; no code change expected (covered by 010's admin CRUD + US1's repoint) — record the result in the PR.

**Checkpoint**: full loop — admin edit → discovery reflects it.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T017 [P] Dead-reference sweep: `grep -rn "beit_chabad\|beitChabad\|BeitChabadPinDTO" apps/ packages/ --include=*.ts --include=*.tsx | grep -v migrations/` returns only this spec (SC-003). Remove any stragglers (e.g., `HostMinyanForm.tsx`, dist is ignored).
- [x] T018 [P] e2e `apps/frontend/e2e/discovery.spec.ts`: extend to assert the discovery map + layer toggle are WCAG 2.1 AA clean (axe), keyboard-operable, RTL (SC-007).
- [x] T019 Run all gates (quickstart "Automated gates"): shared/backend/frontend typecheck + unit tests + discovery e2e; fix drift.
- [x] T020 Docs at merge time: update `CLAUDE.md` (011 complete; latest-migration line → 0012; remove the "beit_chabad_pin folds in 011" pending note) + `specs/ROADMAP.md` status; add a short ADR note (or amend ADR 0011) recording that 003's Beit Chabad overlay is retired and `place` is the SoT. Note the remote dev D1 needs `pnpm db:migrate:remote` (0012) on deploy.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002)** must complete before US1/US3 code compiles.
- **US2 (T003–T007)** is data/schema-only — can run in parallel with US1's frontend once T002 lands; but
  T009's `placesInBbox` needs the Chabad places to exist (010 already provides them, so no hard block).
- **US1 (T008–T014)** depends on T002 (contract). T008/T009 (backend) and T011–T013 (frontend) can proceed
  in parallel after the contract; T010 tests follow the code.
- **US3 (T015–T016)** depends on US1 (discovery repoint) + US2 (single record).
- **Polish (T017–T020)** last.

## Parallel Opportunities

- [P] within US2: T006 (migration test) alongside T004/T005.
- [P] within US1: backend (T008→T009, then T010) in parallel with frontend (T011→T012, then T013) once
  T002 is merged.
- [P] in Polish: T017 (grep sweep) + T018 (e2e) together.

## Implementation Strategy

**MVP = US2 + US1** (both P1): consolidate the data (drop the legacy table) and repoint discovery so the
map still shows Chabad houses with zero regression. US3 is a thin verification. This is a cleanup feature,
so the "increment" is really one coherent slice; ship it as a single PR (migration 0012 + contract + both
sides), CI green, then merge and run the remote migration on deploy.
