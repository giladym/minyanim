---
description: "Task list for Stays — Create & Manage (002)"
---

# Tasks: Stays — Create & Manage

**Input**: Design documents from `specs/002-stays-create-manage/`
**Prerequisites**: plan.md, spec.md (Clarified), research.md (D1–D15), data-model.md, contracts/api.md

**Tests**: Included where the constitution mandates — WCAG 2.1 AA (Principle II), the
cascade-delete guarantee (FR-008/SC-007), the timezone-correct validation (FR-003, the core
correctness risk), and the private-field non-exposure (FR-007). Not full TDD for every unit.

**Organization**: by user story (spec priorities). Stack & paths per [plan.md](./plan.md):
monorepo `apps/frontend`, `apps/backend`, `packages/shared`. Builds on 001.

## Format: `[ID] [P?] [Story] Description with file path`
- **[P]** = parallelizable (different files, no incomplete-task dependency)
- **[USx]** = user-story phase tasks only

---

## Phase 1: Setup (deps, env, tooling)

- [x] T001 [P] Add backend deps: `@photostructure/tz-lookup` to `apps/backend/package.json`
- [x] T002 [P] Add frontend deps: `maplibre-gl` (+ import its CSS) to `apps/frontend/package.json`
- [x] T003 [P] Add frontend test tooling: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` + `apps/frontend/vitest.config.ts` (jsdom env) + `test` script (research D14)
- [x] T004 [P] MapTiler env wiring: `MAPTILER_API_KEY` already a backend secret/`.dev.vars`; add `GEO_MODE` var (`live`|`mock`) to `apps/backend/wrangler.jsonc`; `VITE_MAPTILER_TILE_KEY` in `apps/frontend/.env.local`/`.env.example` (done). Reference `docs/integrations/maptiler-setup.md`
- [x] T005 [P] Add `RATE_LIMITER` reuse note + (if needed) a second rate-limit binding for `/api/geo` in `apps/backend/wrangler.jsonc`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Must complete before user stories.**

- [x] T006 Shared error codes: add `location.required`, `date.in_past`, `date.range_invalid`, `num_men.too_low`, `confirm.required`, `geo.unavailable` to `packages/shared/src/errors.ts` + matching `errors.*` i18n keys in `apps/frontend/src/i18n/locales/{he,en}.ts`
- [x] T007 Shared Zod contracts in `packages/shared/src/schemas/stay.ts`: `PrayerNeedsSchema`, `CreateStayInput`, `UpdateStayInput`, `StayBase`, `OwnerStayDTO`, `PublicStayDTO`, `GeoResultSchema`; structural rules only (range, `numMen≥1`, well-formed date-only epochs); export types
- [x] T008 Drizzle `stay` table in `apps/backend/src/db/schema.ts` (FK `user(id)` ON DELETE CASCADE; columns per data-model; `prayer_needs` `text({mode:'json'}).$type<PrayerNeeds>()`; index `(user_id, arrival_date)` + `user_id`)
- [x] T009 Generate + apply migration (`drizzle-kit generate`; `wrangler d1 migrations apply minyanim --local`) → `apps/backend/migrations/`
- [x] T010 [P] `apps/backend/src/lib/timezone.ts`: `tzFromCoords(lat,lng)` (@photostructure/tz-lookup), `civilDate(epoch, tz)` + `todayCivil(tz)` via `Intl.DateTimeFormat("en-CA",{timeZone})`, `coversShabbat(arrival,departure,tz)`; JSDoc. Pure, unit-testable
- [x] T011 [P] `apps/backend/src/services/geoService.ts`: MapTiler forward-geocoding (injectable `fetch`; sends `User-Agent: Minyanim-Server/1.0`; `language` localizes labels only — **no country filter**, search is global, corrected T036), normalize → `GeoResultSchema`, Cache API (`caches.default`, ~24h), `GEO_MODE=mock` canned path, `geo.unavailable` on provider error
- [x] T012 [P] Stay repository `apps/backend/src/repositories/stayRepository.ts`: create/getById(owned)/listByUser(nearest-first active)/update/cancel; Drizzle queries; `prayer_needs` JSON round-trip
- [x] T013 Stay service `apps/backend/src/services/stayService.ts`: temporal validation (destination tz from coords → `X-Client-Timezone` → ±1-day; `AppError(400, code, field)`), `coversShabbat` default, contact snapshot, DTO selection (Owner), `PrayerNeedsSchema.parse` on read/write
- [x] T014 Stay controller + routes `apps/backend/src/controllers/stayController.ts` + `apps/backend/src/routes/stays.ts`: plain Hono + `safeParse`, ownership-404, `OwnerStayDTO.parse()` before `c.json()`; wire endpoints (contracts) + mount in `apps/backend/src/index.ts`
- [x] T015 Geo route `apps/backend/src/routes/geo.ts`: `GET /api/geo/search` (session-required, rate-limited, reads `X-Client-Timezone` not needed here) → mount
- [x] T016 [P] Frontend typed API client + TanStack Query hooks `apps/frontend/src/lib/stays.ts` (list/create/get/update/cancel; sends `X-Client-Timezone`) + `apps/frontend/src/lib/geo.ts` (search)

**Checkpoint**: contracts + data layer ready.

---

## Phase 3: User Story 1 — Register a Stay (P1) 🎯

- [x] T017 [US1] `LocationPicker.tsx` (`apps/frontend/src/features/stays/`): search-first input (debounced → `/api/geo/search`), result list, lazy MapLibre confirmation map (RTL, `maplibre-gl.css`), manual city/country fallback, attribution
- [x] T018 [US1] `PrayerNeeds.tsx` + `AddEditStayForm.tsx`: required fields, smart defaults (contact from `/api/me`, `numMen=1`, Shabbat auto-on via `coversShabbat`), progressive disclosure ("פרטים נוספים"), privacy microcopy on address, shared-Zod validation → keyed errors via react-i18next; ≥44px, keyboard, RTL
- [x] T019 [US1] Wire create route(s) `/stays/new` in `apps/frontend/src/router.tsx`; on submit → optimistic `useMutation` → return to dashboard highlighted + success toast (SC-002)
- [x] T020 [P] [US1] Backend tests `apps/backend/test/stays.test.ts` (create) + `geo.test.ts`: structural + **temporal** (vi.setSystemTime + real tz-lookup, NY vs Jerusalem date-line), geo normalize + `geo.unavailable` (mocked provider)
- [x] T021 [P] [US1] Frontend unit tests (Vitest+TL): form validation messages (he), defaults, progressive disclosure

---

## Phase 4: User Story 2 — View & Sort My Stays (P1)

- [x] T022 [US2] `StaysDashboard.tsx` (replaces 001 `StaysPlaceholder`) + `StayCard.tsx`: nearest-first list, empty state ("הוסף יעד" CTA + explainer), past-stay distinct styling (derived `isPast`), Sefer Torah badge; wire `/stays`
- [x] T023 [P] [US2] Backend test: list sort (nearest-first, active only) + derived `isPast`/`coversShabbat` in `apps/backend/test/stays.test.ts`
- [x] T024 [P] [US2] e2e `apps/frontend/e2e/stays.spec.ts`: empty state, create→appears, sort order, past styling (+ `GEO_MODE=mock` backend in `playwright.config.ts`)

---

## Phase 5: User Story 3 — Edit or Cancel a Stay (P1)

- [x] T025 [US3] Edit flow: reuse `AddEditStayForm` for `/stays/:id/edit`; PATCH with same temporal rule (no date into past); reflect within 2s (SC-003)
- [x] T026 [US3] Cancel flow: confirmation dialog → `POST /api/stays/{id}/cancel` (`confirm:true`); leaves active list; `confirm.required` without it
- [x] T027 [P] [US3] Backend tests: update (incl. no-past-on-edit), cancel (soft + confirm guard), ownership-404
- [x] T028 [P] [US3] e2e: edit dates/men reflected; cancel removes from active list

---

## Final Phase: Polish & Cross-Cutting

- [x] T029 **Cascade-orphan integration test** `apps/backend/test/stay-cascade.test.ts`: create user + stays → `deleteUser` → assert zero orphan `stay` rows (extends 001; FR-008/SC-007)
- [x] T030 **Private-field non-exposure test**: assert `PublicStayDTO` output has no `addressPrivate`/`contactPhone`/`contactEmail` keys (FR-007/D8)
- [x] T031 [P] axe WCAG 2.1 AA on form/map/dashboard at 375px + desktop; keyboard + RTL (in `stays.spec.ts`)
- [x] T032 [P] i18n audit: all new strings keyed (he/en), no hardcoded colors (tokens only)
- [x] T033 Run `quickstart.md` scenarios end-to-end locally; verify SC-001..SC-004
- [x] T034 Update OpenAPI/Swagger note + `docs` if needed; ensure `pnpm typecheck && lint && test` green; push (CI + Workers Builds auto-deploy from `002-...` is preview-only — verify on develop after merge)

---

## Post-launch reconciliation (2026-06-20)

Surfaced from hands-on use; spec/research/plan updated accordingly (Clarifications Session 2026-06-20).

- [x] T035 **Submit-error UX (FR-012)**: keep "Save stay" enabled; on failed submit show a `role="alert"` error summary by the button (`stays.fixErrors`, he/en), focus the first invalid field, auto-expand "פרטים נוספים" if a hidden field is flagged. `LocationPicker` accepts an `invalid` prop so the active location input carries `aria-invalid`. Same behavior for server-returned field errors. Unit test in `AddEditStayForm.test.tsx`.
- [x] T036 **Global place search (bug fix, FR-002/FR-008)**: remove the hard `country=il` filter from `geoService.searchPlaces` — search is global in every language (`language` localizes labels only). Refactor the provider-fetch + Cache-API read/write into shared helpers. Update `apps/backend/test/geo.test.ts` (assert no country filter + correct `language` for he/en).
- [x] T037 **Map click-to-pick (FR-008a)**: add `reverseGeocode` to `geoService` + `GET /api/geo/reverse` (session-required, rate-limited, `400 geo.invalid_coords` for out-of-range coords) wired in `routes/geo.ts`; new shared error code `geo.invalid_coords` (+ he/en i18n). Frontend: `reverseGeocode` in `lib/geo.ts`; make `LocationPicker`'s `PickableMap` interactive (init-once map, click → reverse-geocode → fill location, imperative marker/center sync), with `mapHint`/`mapPickAlt`/`reverseSearching`/`reverseNoResults` i18n. Backend tests: reverse service (lng,lat order, rounded, no country filter) + route (401/400/200). Update `contracts/api.md`.
- [x] T038 **Date-picker min/max affordance (FR-012)**: constrain the arrival/departure native pickers in `AddEditStayForm.tsx` — departure `min` = arrival, arrival `max` = departure, both floored at a soft past-floor (device yesterday, ±1-day buffer matching the server) — to prevent an out-of-order or clearly-past range at entry. UX affordance only; shared schema + server stay authoritative (`departure ≥ arrival`, timezone-correct past check unchanged). Unit test in `AddEditStayForm.test.tsx`.

---

## Dependencies & Execution Order

- **Setup (T001–T005)** → **Foundational (T006–T016)** → user stories.
- Within Foundational: T006/T007 first (contracts), then T008–T009 (schema/migration), then
  T010/T011/T012 [P], then T013 (service, needs repo+tz), T014/T015 (routes, need service), T016 [P].
- US1 (T017–T021) is the MVP; US2 (T022–T024) and US3 (T025–T028) follow. Backend tests [P] with UI.
- Polish (T029–T034) last.

## Parallel Opportunities

- T001/T002/T003/T004/T005 together (setup, different files).
- T010/T011/T012 together (timezone / geo / repository — different files).
- Test tasks (T020/T021, T023/T024, T027/T028) parallel with their UI tasks.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (a user can create a Stay and see it). US2/US3 complete the CRUD.
Honor every Clarification + research decision; geocoding mockable until live key validated.

## Notes

- ⭐ MapTiler key set (secret + tile var); UA-restricted geocoding key → Worker sends matching UA.
- No pagination v1; `db.batch` only if a multi-row write appears (none in 002).
- 003 geospatial seam (D15) recorded — do NOT add lat/lng index in 002.
