---
description: "Task list for A location holds events (015) — retroactive, all shipped"
---

# Tasks: A location holds events

**Input**: Design documents from `specs/015-location-events/` (spec.md, plan.md, data-model.md,
design/decision.md).
**Status**: **Shipped** — merged to develop (PRs #60/#61), migration 0015 applied local + remote. This
list is **retroactive**: every task is `- [X]` (done). Built in parallel by a backend agent and a
frontend agent, then verified (typechecks + backend/FE suites + build).

**Organization**: by layer (schema/migration · shared contracts · backend · frontend · reactivity ·
docs). Builds on the 014 generic event model + the 013 `attendance.stay_id` linkage
([../014-multi-type-events/](../014-multi-type-events/)). **Pre-launch: no real data — migration 0015
drops columns destructively; run the backend suite in small batches (port exhaustion).**

## Format: `[ID] [P?] Description with file path`
- **[P]** = parallelizable (different files, no incomplete-task dependency)

---

## Phase 1: Schema + migration 0015

- [X] T001 Add `event.stayId` (text FK → `stay(id)`, `ON DELETE SET NULL`) + `event_stay_idx` index; drop `stay.brings_sefer_torah` + `stay.prayer_needs` (keep `num_men`) in `apps/backend/src/db/schema.ts`.
- [X] T002 Generate + apply migration **0015** (`0015_location_events.sql`: `ALTER TABLE event ADD stay_id …` + `CREATE INDEX event_stay_idx` + two `DROP COLUMN`s) into `apps/backend/migrations/` (+ `meta/0015_snapshot.json`, `_journal.json`); apply local + remote (`pnpm db:migrate:remote`). Ensure `apps/backend/test/apply-migrations.ts` picks it up.

## Phase 2: Shared contracts

- [X] T003 [P] `packages/shared/src/schemas/stay.ts`: drop `bringsSeferTorah` + `prayerNeeds` from `CreateStayInput`/`UpdateStayInput` + `OwnerStayDTO` + `toPublicStayDTO`; keep `numMen`; update the file header to describe the location as a pure anchor (015).
- [X] T004 [P] `packages/shared/src/schemas/discovery.ts`: drop `seferTorahCount` from `PotentialBucket` (men-overlap only); keep the `DiscoveryQuery.seferTorah` filter (applies to minyan events). Reuse `MyEventRow` for the location-events read — no new DTO.

## Phase 3: Backend — linkage, read, and field removal

- [X] T005 Stamp `event.stayId` at creation in `apps/backend/src/services/eventService.ts`: `hostMinyan` (minyan) + `createGathering` (gathering) write `stayId: input.stayId ?? null` (threaded from `CreateEventInput.stayId` / the FE `fromStay`).
- [X] T006 Add `eventsForStay(db, stayId, userId)` to `apps/backend/src/repositories/eventRepository.ts`: hosted (`event.stay_id = stayId`) ∪ joined (`attendance.stay_id = stayId`, status in confirmed/pending/waitlisted) → its event, deduped by event id (hosted precedence), earliest-first, marking `hosted` rows.
- [X] T007 Add `getStayEvents(ctx, userId, stayId)` to `eventService.ts`: owner-gate via `getStayById` (null → 404), build each row into a `MyEventRow` via the shared `toMyEventRow` (derived status + `myStatus` + `pendingRequestCount` on hosted approval-mode rows). → `{ events: MyEventRow[] }`.
- [X] T008 Add `stayEventsController` to `apps/backend/src/controllers/eventController.ts` (throws `NotFound()` when the read is null) + route `GET /api/stays/:id/events` in `apps/backend/src/routes/stays.ts`.
- [X] T009 [P] Remove the dropped fields from `apps/backend/src/services/stayService.ts` (`toOwnerDTO`/`createStay`/`updateStay` no longer read/write `bringsSeferTorah`/`prayerNeeds`; drop the `PrayerNeedsSchema` import).
- [X] T010 [P] Discovery potential: drop `bringsSeferTorah` from `PotentialStay`/`POTENTIAL_COLS`/`normalizeStay` in `apps/backend/src/repositories/discoveryRepository.ts`; drop `seferTorahCount` accumulation in `bucketPotential` (`apps/backend/src/services/discoveryService.ts`).

## Phase 4: Frontend — location form, events section, card chip

- [X] T011 `apps/frontend/src/features/stays/StayEvents.tsx` (NEW): `StayEventsSection` ("האירועים שלי כאן" list + "＋ הוסף אירוע" → `/event/new?fromStay=…`, kind badges per row, links to `/minyan/$id` or `/event/$id`) + `StayEventsChip` ("N אירועים" pill, renders nothing when empty).
- [X] T012 `apps/frontend/src/lib/stays.ts`: `useStayEvents(stayId)` — `GET /api/stays/:id/events` keyed `["stay-events", stayId]`, degrades to `[]` until the endpoint is live (`.catch(() => [])`), disabled until a stay id is known.
- [X] T013 `apps/frontend/src/features/stays/AddEditStayForm.tsx`: remove the `PrayerNeeds` + Sefer-Torah card and the `coversShabbat` client mirror; relabel the group-size field; render `<StayEventsSection>` only for a **saved** stay (`isEdit && stayId`). Delete `apps/frontend/src/features/stays/PrayerNeeds.tsx`.
- [X] T014 [P] `apps/frontend/src/features/stays/StayCard.tsx`: render `<StayEventsChip>` on an active (non-past) card next to the folder chip.
- [X] T015 [P] i18n: add the `stays.events.*` namespace (title/add/empty/count, pluralized) + relabel `stays.numMen` ("מי מגיע — …") in `apps/frontend/src/i18n/locales/{he,en}.ts` (parity-tested).

## Phase 5: Reactivity

- [X] T016 `apps/frontend/src/lib/events.ts`: add `invalidateEventViews(qc, id?)` invalidating the event detail + `myEventsKey` + `["stay-events"]`, and wire it into every event mutation hook (host minyan + host gathering, update, cancel, commit/RSVP, request/approve/decline, role claim) so the "האירועים שלי כאן" list + "N אירועים" chip stay reactive on create/cancel/RSVP (FR-006/SC-006).

## Phase 6: Tests

- [X] T017 [P] `apps/backend/test/stay-events.test.ts`: owner-gated UNION read (hosted ∪ joined, deduped, earliest-first; 404 for a non-owner).
- [X] T018 [P] Update the event-cascade test (`event-cascade.test.ts`) to assert deleting a location NULLs `event.stay_id` (events survive); update the stay/discovery/minyan suites for the dropped fields (`discovery.test.ts`, `near-stay.test.ts`, `stay-*.test.ts`, etc.).
- [X] T019 [P] Frontend tests: `StayEvents.test.tsx` (section + chip); update `AddEditStayForm.test.tsx` (no Sefer-Torah/prayer controls) + `StayCard.test.tsx` (chip) + `DiscoveryPage.test.tsx`.

## Phase 7: Docs

- [X] T020 Update `CLAUDE.md` with the 015 summary (shipped in PR #61); write this `specs/015-location-events/` doc set (spec/plan/data-model/design/tasks) retroactively.

---

## Dependencies & order

- **Schema/migration (T001–T002)** → **shared contracts (T003–T004)** → **backend (T005–T010)** +
  **frontend (T011–T016)** in parallel → **tests (T017–T019)** → **docs (T020)**.
- The FE shipped ahead of / alongside the backend: `useStayEvents` degrades to an empty list until
  `GET /api/stays/:id/events` is live, so T011–T016 did not block on T005–T008.

## Verification (as run)

- `pnpm typecheck` across the monorepo (shared → backend → frontend).
- Backend suite in small batches (port exhaustion) — including `stay-events.test.ts` + the updated
  cascade/discovery/stay suites.
- Frontend Vitest + Testing Library (`StayEvents.test.tsx` + updated form/card/discovery tests).
- `pnpm build` (Vite SPA + Worker) green.
- Migration 0015 applied local + remote (`pnpm db:migrate:remote`).
