---
description: "Task list for Multi-type events (hosting, gatherings, occasions) (014)"
---

# Tasks: Multi-type events (hosting, gatherings, occasions)

**Input**: Design documents from `specs/014-multi-type-events/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R14), data-model.md, contracts/api.md,
design/ux.md, validation-report.md (R2=Option A + the 13-site confirmed-predicate audit + the corrected
capacity/waitlist state machine).

**Tests**: Included where correctness/constitution demand — the **minyan regression** decision table
(SC-005, the top risk), **capacity+waitlist concurrency** (SC-006), **per-type DTO non-exposure**
(SC-003, the reveal-gate leak site), occasion+type discovery filtering (SC-004), cascade-delete, and
**WCAG 2.1 AA** (Principle II). Not full TDD per unit.

**Organization**: by user story (spec priorities). Stack & paths per [plan.md](./plan.md): monorepo
`apps/frontend`, `apps/backend`, `packages/shared`. Builds on the generic `event`+1:1-detail model
(003 D21). **R2 = Option A: `commitment` → unified `attendance`.** **Pre-launch: no real data —
migration 0014 may drop/recreate; run the backend suite in small batches (port exhaustion).**

## Format: `[ID] [P?] [Story] Description with file path`
- **[P]** = parallelizable (different files, no incomplete-task dependency)
- **[USx]** = user-story phase tasks only

---

## Phase 1: Setup

- [X] T001 [P] Add capacity/rsvp constants to `packages/shared/src/config.ts` (reuse `PARTY_SIZE_MAX`; add any new bounds e.g. `EVENT_CAPACITY_MAX`) and confirm they export via `packages/shared/src/index.ts`.
- [X] T002 [P] Extend `packages/shared/src/errors.ts` with the new codes (contracts/api.md): `event.type_invalid`, `category.invalid`, `occasion.invalid`, `rsvp.mode_invalid`, `rsvp.closed`, `visibility.invalid`, `capacity.invalid`, `capacity.full`, `request.not_pending`, `request.not_host`, `attendance.not_found`, `gathering.attrs_invalid`, `event.time_invalid`, and generalize `minyan.cancelled`/`minyan.completed` → `event.cancelled`/`event.completed`. Add matching `errors.*` he/en keys in `apps/frontend/src/i18n/locales/{he,en}.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Must complete before any user story. This is the generalized base the minyan becomes an instance of; it touches the flagship minyan path, so the US4 regression gate (Phase 3) validates it before new types are built.**

### Shared contracts
- [X] T003 [P] In `packages/shared/src/schemas/event.ts`: widen `EventTypeSchema` → `["minyan","gathering"]` (behavior classes); add `CategorySchema` (`hosting|social|learning|celebration` — v1 builds hosting+social), `OccasionSchema`, `RsvpModeSchema` (`open|approval|invite`), `VisibilitySchema` (`public|unlisted|invite`); add generic `event` fields to `CreateEventInput`/`UpdateEventInput` (`category?` — required when type=gathering, forbidden for minyan; `occasion?`, `rsvpMode?`, `visibility?`, `capacity?`, `startTime?`/`endTime?` `HH:MM`, `rsvpCutoff?`).
- [X] T004 [P] Add the gathering attrs contracts in `event.ts` — a **per-category attrs schema map (`ATTRS_BY_CATEGORY`) + a `GatheringAttrs` union type** (the wire `gathering` block has no `category` key, so validation is `ATTRS_BY_CATEGORY[category].parse(body.gathering)`; hosting: mealType, kashrut, dietary[], offering?, bringItems?, alcohol, accessibility?; social: subcategory) — plus the data-level `CATEGORY_META` map (label key, icon name, `defaultRsvpMode` per category) **and the shared `EVENT_KINDS` map** (`minyan→{type:'minyan',category:null,labelKey,icon}`, `hosting→{type:'gathering',category:'hosting',…}`, `social→{type:'gathering',category:'social',…}`) — the ONE home of the kind→(type,category) mapping, read by the FE picker, discovery chips, `?kind=` deep links, and server default-resolution (with `CATEGORY_META` defaults); `CATEGORY_META` alone has no minyan entry — `EVENT_KINDS` covers the picker's minyan label/icon. Extend `CreateEventInput` to accept exactly one detail block (`minyan`|`gathering`).
- [X] T005 Generalize the DTO ladder in `event.ts` → `PublicEventDTO`/`RosterEventDTO`/`ParticipantEventDTO`/`OwnerEventDTO` (keep the minyan-specific derived fields under the minyan branch) + `toPublicEventDTO` **allowlist** projection (enumerate public fields per type — never spread the joined row; the SC-003 structural guard). Add derived `rsvpState` (`open|closed`) + `seatsRemaining`. Keep old `*MinyanDTO` names as type aliases so shipped code compiles.
- [X] T006 [P] Generalize attendance contracts: rename/replace `packages/shared/src/schemas/commitment.ts` → `attendance.ts` (`AttendanceStatusSchema`, `CreateAttendanceInput` {partySize, stayId?}, `UpdateAttendanceInput`, `AttendanceDTO` with status + requestedAt); add new `NotificationKind`s (`seat_requested`, `request_approved`, `request_declined`, `waitlist_promoted`) to `packages/shared/src/schemas/notification.ts`. Add `export * from "./attendance"` to `schemas/index.ts`.
- [X] T007 [P] Add `types?`/`categories?`/`occasion?` params + a generalized `events: PublicEventDTO[]` field to `DiscoveryResult` in `packages/shared/src/schemas/discovery.ts` — the `minyanim` field is **REPLACED** by `events` (pre-launch, single FE consumer); the FE migrates in US2.

### DB schema + migration 0014
- [X] T008 In `apps/backend/src/db/schema.ts`: add `event` columns (`category`, `occasion`, `rsvpMode`, `visibility`, `capacity`, `startTime`, `endTime`, `rsvpCutoff`); add ONE `gathering` 1:1 detail table (`event_id` PK, `attrs` JSON, cascade from `event` — no `meal` table; hosting is a gathering category); rename `commitment` → `attendance` (`numMen`→`partySize`, add `status` default `'confirmed'`, `requestedAt`); indexes `attendance_event_idx`, `attendance_user_idx`, `attendance_event_status_req_idx (event_id,status,requested_at)`, unique `(event_id,user_id)`.
- [X] T009 Generate + apply migration 0014 (`pnpm --filter @minyanim/backend db:generate` → `db:migrate:local`) into `apps/backend/migrations/`; backfill existing minyan events (`rsvp_mode='open'`, `visibility='public'`, `category/capacity/occasion/times/rsvp_cutoff` NULL) + every existing attendance `status='confirmed'`. Ensure `apps/backend/test/apply-migrations.ts` picks it up.

### Per-type strategy + generalized read/write
- [X] T010 Create `apps/backend/src/lib/eventStrategy.ts`: a per-behavior map with exactly TWO entries `{ readiness, detailParse, detailInsertValues, publicDetail, hostSelfAttends, defaultRsvpMode }`. `minyan` = today's `lib/minyanStatus.ts` functions + `hostSelfAttends:true`; `gathering` = the capacity/RSVP derivation + `hostSelfAttends:false` (per-category defaults resolved via shared `CATEGORY_META`).
- [X] T011 Generalize `apps/backend/src/repositories/eventRepository.ts`: `SELECT_JOINED` per-type detail join; `createMinyanBatch` → `createEventBatch(type, …)` inserting event + the correct detail row (+ host attendance only when `hostSelfAttends`); `listMinyanimInBbox` → `listEventsInBbox(q, {types?, categories?, occasion?})` (drop the hard-coded `eq(event.type,"minyan")`).
- [X] T012 **[Confirmed-predicate audit — SC-003/SC-005, 13 sites]** add `status='confirmed'` to every commitment read/sum per validation-report.md (simplest defense: the repo exposes `getConfirmedAttendance` so no caller can forget the predicate): `committedMenByEvent`, `getCommitment` (return status; caller treats only `confirmed` as committed — the reveal-gate leak site), `participantsForEvent`, `userCommittedNearby` (eventRepository.ts); `userCommitmentsOnDate`, `commitmentsByStay`/`linkedMinyanimForStay`, `updateCommitmentMen` (commitmentRepository.ts:18–25 — must gain a status predicate (confirmed/waitlisted/pending only) or be folded into the re-join path, else soft-cancel silently resizes a cancelled row + fires `onQuorumChange`); `recipientsForEvent` (notificationRepository.ts); metrics quorum funnel (metricsRepository.ts); claim-merge reassign (claimRepository.ts); role claim gate (roleService.ts:15 — a claim MUST require a CONFIRMED attendance, else a withdrawn participant can still hold Ba'al Korei and the readiness derivation lies); `transferHost` (commitmentService.ts:103 — must require confirmed, else a withdrawn user could be reassigned host → `OwnerEventDTO` incl. exact address).
  - Soft-cancel interaction sites (R14): (a) `reconcileCommitmentsForStay` (commitmentService.ts:123–137, the 013 auto-withdraw) currently hard-DELETEs — change to soft-cancel for consistency with R14 (same predicate everywhere); (b) `claimSeeds` dedup (claimRepository.ts:78–84) must become status-aware (on an `(event_id,user_id)` clash keep the **confirmed** row, not blindly the real user's possibly-cancelled row).
- [X] T013 Generalize `apps/backend/src/services/eventService.ts`: `buildPublic`/`withRosterFields`/`getMinyan`→`getEvent` parameterized by type; the reveal gate uses `attendance.status==='confirmed'` (not row-exists); per-type create in `hostEvent`. Keep exported `hostMinyan`/`getMinyan` as thin wrappers so the `/minyan` controller + tests still resolve.
- [X] T014 Create `apps/backend/src/repositories/attendanceRepository.ts` + `apps/backend/src/services/attendanceService.ts`: the guarded single-statement writes from research R4/contracts — open-mode join (`INSERT…SELECT…RETURNING status`), approval-mode request (`pending`), guarded approve (`UPDATE…WHERE status='pending' AND fits RETURNING id`), decline, soft-cancel + open-mode earliest-that-fits promotion (`RETURNING user_id`). `assertJoinable` + not-closed (`rsvp_cutoff`/date) guard. Note: `insertCommitment`'s `onConflictDoNothing` becomes `onConflictDoUpdate` for the R14 re-join path (re-join UPDATEs the soft-cancelled row).
- [X] T015 Keep the shipped `POST/PATCH/DELETE /api/events/:id/commit` routes as thin aliases delegating to `attendanceService` (open mode, `status='confirmed'`) in `apps/backend/src/routes/events.ts` + `controllers/eventController.ts` — no minyan wire change (R13/SC-005). The alias's insert path inherits the T014 `onConflictDoUpdate` (re-join) semantics.

### Foundational tests
- [X] T016 [P] Extend the cascade-orphan test to `gathering`/`attendance` (account + event deletion removes all child rows) in `apps/backend/test/`.

**Checkpoint**: generalized base compiles; minyan path unchanged on the wire. Proceed to the US4 regression gate.

---

## Phase 3: US4 — Minyan hosting continues unchanged (Priority: P1 / regression gate)

**Goal**: prove the flagship minyan flow is byte-for-byte unchanged after the Option-A generalization.
**Independent test**: host→commit→quorum→readiness→cancel + tiered reveal + 013 guard all pass.

- [X] T017 [US4] Run the existing minyan backend suites (readiness decision table, quorum concurrency, notification idempotency, roster/privacy DTO) unchanged; fix any generalization regression until green. Run in small batches (port exhaustion).
- [X] T018 [P] [US4] Add a regression test proving a `pending`/`waitlisted` attendee is NOT treated as committed: minyan self-commit + join still `confirmed`; a hypothetical non-confirmed row does not count toward quorum and does NOT unlock the address (SC-003 reveal-gate). `apps/backend/test/`.
- [X] T019 [P] [US4] FE: confirm `MinyanDetail`/`HostMinyanForm`/discovery `MinyanRow` render unchanged (existing `MinyanDetail.test.tsx`/`HostMinyanForm.test.tsx` pass); `/minyan/$id` + `/minyan/new?fromStay=` routes intact.

**Checkpoint**: SC-005 green — safe to build new types.

---

## Phase 4: US1 — Host a traveler for a Shabbat/holiday meal (Priority: P1) 🎯 MVP

**Goal**: create a hosting event with seats + approval; a traveler requests; host approves/declines; waitlist + capacity hold; address reveals only on confirm.
**Independent test**: quickstart Scenario A + B.

### Backend
- [X] T020 [US1] Implement the **hosting category config** (the `CATEGORY_META` hosting entry + the hosting `ATTRS_BY_CATEGORY` attrs variant + `defaultRsvpMode='approval'`) and wire the shared `gathering` strategy pieces it exercises in `eventStrategy.ts` (attrs parse/insert, public detail projection, `hostSelfAttends:false`, `readiness` = capacity/full derivation).
- [X] T021 [US1] `POST /api/events` hosting branch in `routes/events.ts`/`controllers`/`eventService.hostEvent`: require+validate `category` (`category.invalid`), validate `gathering` attrs (hosting variant), apply category defaults, create event+gathering (no host attendance), `assertUserActive`+`assertNotPast`. → `201 OwnerEventDTO`.
- [X] T022 [US1] Attendance endpoints in `routes/events.ts`: `POST/PATCH/DELETE /api/events/:id/attendance`; `GET /api/events/:id/requests`; `POST /api/events/:id/requests/:attendanceId/{approve,decline}` (host-only; `request.not_host`→404). Wire to `attendanceService` (T014).
- [X] T023 [US1] Notifications: add `seat_requested`/`request_approved`/`request_declined`/`waitlist_promoted` to `notificationService` fan-out; make the hardcoded `/minyan/${eventId}` URL type-aware (`/event/${id}` for non-minyan); ensure `notificationEmail()` handles the new kinds (he/en). `apps/backend/src/services/notificationService.ts` + `lib/notification-email.ts`.

### Backend tests
- [X] T024 [P] [US1] **Capacity + waitlist concurrency (SC-006)**: approve beyond capacity fails `capacity.full`; the (capacity+1)th confirm impossible with variable party sizes; cancel promotes earliest-that-fits; approval mode never auto-confirms on freed seat; **also cover the re-join race** (the re-join upsert recomputing confirmed-vs-waitlisted), not just first-join. `apps/backend/test/`.
- [X] T025 [P] [US1] **Per-type DTO non-exposure (SC-003)**: a `pending`/`waitlisted` hosting requester receives `PublicEventDTO`/`RosterEventDTO` with address/entry-notes/exact-coords/email structurally absent; a `confirmed` guest + host get them. `apps/backend/test/`.
- [X] T026 [P] [US1] request→approve→confirm→reveal happy path + decline path; `rsvp.closed` after cutoff/date; re-join UPDATEs the soft-cancelled row. `apps/backend/test/`.

### Frontend
- [X] T027 [US1] Kind picker screen (מניין / אירוח / מפגש → type+category via the shared `EVENT_KINDS` map) + generalize `HostMinyanForm`→`HostEventForm` (minyan branch verbatim; hosting branch: mealType/seats/kashrut/dietary/offering/bring/alcohol/accessibility + rsvpMode + visibility + rsvpCutoff + start/end time). Route `/event/new?kind=&fromStay=`; minyan-context entry deep-links `kind=minyan` skipping the picker (ux Screen 1/2). Host entry points per ux: the bottom-nav ＋ FAB opens a two-option sheet (שהות חדשה / אירוע חדש → picker) + a persistent dashboard "ארחו אצלכם" card (no-upcoming-Stay users) routing to the picker. `apps/frontend/src/features/events/` + `router.tsx`.
- [X] T028 [US1] Generalize `MinyanDetail`→`EventDetail` (minyan branch verbatim; hosting branch: seats meter `aria-live`, seudah facts (meal type/kashrut/dietary/offering/bring), tiered reveal with lock hint). Route `/event/$id` (keep `/minyan/$id`). `apps/frontend/src/features/events/EventDetail.tsx`.
- [X] T029 [US1] RSVP band (generalize `CommitSection`) with the ux Screen-4 state matrix (request/pending/reduce-to-fit/confirmed/declined/closed) + `RequestsPanel` (generic approval-mode gathering: host approve/decline pending queue, confirmed roster, Message-host link 008). `apps/frontend/src/features/events/`.
- [X] T030 [P] [US1] Attendance TanStack Query hooks in `apps/frontend/src/lib/events.ts` (`useRequestSeat`/`useApprove`/`useDecline`/`useCancelAttendance`/`useChangePartySize`) with `onSettled` invalidate; polling reuses `POLL_DETAIL_MS`.
- [X] T031 [P] [US1] i18n he+en namespaces `eventKind`/`occasion`/`hosting`/`rsvp` in `locales/{he,en}.ts` (parity-tested). Kind chips/badges use the new social accent token (see T037) — ship with an AA contrast check.
- [X] T031a [US1] **"My events" surface**: `GET /api/me/events` (backend: repository+service+route) + FE list (dashboard/profile entry, מארח/משתתף groups, pending-request badges on hosted approval-mode events) + i18n. `apps/backend/src/routes/` + `services/` + `repositories/` + `apps/frontend/src/features/events/MyEvents.tsx`.
- [X] T031b [US1] **Email notifications** for `seat_requested`/`request_approved`/`request_declined`: extend `notificationEmail` templates (he/en) + `fanOut` wiring + deep link to the event. `apps/backend/src/lib/notification-email.ts`.

### Frontend tests
- [X] T032 [P] [US1] Testing-Library tests: hosting create flow, RSVP band states, `RequestsPanel` approve/decline, seats meter announces via `aria-live`. `apps/frontend/src/features/events/*.test.tsx`.

**Checkpoint**: US1 independently demoable (quickstart A+B).

---

## Phase 5: US2 — Discover & request hosting events/gatherings near my Stay (Priority: P1)

**Goal**: discovery surfaces all kinds near a Stay, filterable by kind (types+categories) + occasion.
**Independent test**: quickstart Scenario C.

- [X] T033 [US2] Generalize `discoveryService.discover` + `toPublicMinyan`→type-parameterized public projection; return `events: PublicEventDTO[]`; apply `types`/`categories`/`occasion` filters (nusach/seferTorah applied only to minyan rows). `apps/backend/src/services/discoveryService.ts` + `listEventsInBbox` (T011).
- [X] T034 [US2] Discovery route + query parse: add `types` (CSV) + `categories` (CSV) + `occasion` params in `apps/backend/src/routes/*discovery*`; exclude hidden/cancelled/completed/non-public.
- [X] T035 [P] [US2] Backend test: occasion+kind (types+categories) filtering returns the right subset; unlisted excluded from discovery but reachable by id. `apps/backend/test/`.
- [X] T036 [US2] FE `DiscoveryPage`: kind filter chips הכל · מניינים · אירוח · מפגשים (`aria-pressed`, icon+accent; chips map to `types`+`categories`) + occasion select; nusach/seferTorah shown only when minyan in scope; minyan-context entry pre-applies the minyan filter; `MinyanRow`→`EventRow` (kind icon + occasion chip + per-kind one-liner). `apps/frontend/src/features/discovery/`.
- [X] T037 [P] [US2] FE `DiscoveryMap`: distinct hosting + social pin styles (shape+icon, not color-only). Social uses a NEW distinct accent token pair (e.g. `--sky` light/dark) added to tokens.css — `--teal` now equals the primary green family and cannot differentiate; ship with an AA contrast check (or fall back to icon+shape-only). `apps/frontend/src/features/discovery/DiscoveryMap.tsx`.
- [X] T038 [P] [US2] i18n discovery filter labels (he+en) + FE test for filter behavior. `locales/{he,en}.ts` + `DiscoveryPage.test.tsx`.

**Checkpoint**: US1+US2 = the mission loop (host a hosting event → traveler finds + requests it).

---

## Phase 6: US3 — Host a general social gathering (party/kiddush/meetup) (Priority: P2)

**Goal**: create a social gathering with open RSVP + optional capacity/waitlist.
**Independent test**: quickstart Scenario D.

- [X] T039 [US3] Add the **social category variant** (not a new strategy — the `gathering` behavior already exists): `CATEGORY_META` social entry + the social `ATTRS_BY_CATEGORY` attrs variant ({subcategory}), `defaultRsvpMode='open'` + the `POST /api/events` social branch.
- [X] T040 [P] [US3] Backend test: open-mode join auto-confirms under capacity, waitlists past capacity, promotes on cancel. `apps/backend/test/`.
- [X] T041 [US3] FE social branch in `HostEventForm` + `EventDetail` (subcategory, optional capacity meter, open RSVP band) + i18n `social` namespace. Social chip/badge uses the new accent token (T037) with an AA contrast check. `apps/frontend/src/features/events/` + `locales/{he,en}.ts`.
- [X] T042 [P] [US3] FE test: social gathering create + open RSVP + waitlist state. `apps/frontend/src/features/events/*.test.tsx`.

### Edit / cancel any type (FR-012 — closes analyze gap C1/C2)
- [X] T042a [US3] Generalize `updateMinyan`→`updateEvent` (type-aware `PATCH /api/events/:id`, host-only) + `cancelEvent` in `eventService.ts`/`controllers`/`routes`: edit generic + type-attrs fields; reject reducing `capacity` below the confirmed party-size sum (`capacity.invalid`); reuse `HostEventForm` for edit. Cancel voids attendances/roles + notifies confirmed attendees for every type. Backend test: edit a hosting event, capacity-reduce guard, cancelling a hosting event notifies confirmed guests. `apps/backend/` + `apps/frontend/src/features/events/`.

---

## Phase 7: Polish & Cross-Cutting

- [X] T043 [P] Moderation/enforcement parity: extend the existing moderation tests to a hosting-gathering fixture (flag `contentType='event'` hides a hosting event; suspended host blocked from create + request). `apps/backend/test/`.
- [X] T044 [P] i18n parity test green across all new namespaces (`i18n/parity.test.ts`); RTL spot-check of the new surfaces.
- [X] T045 [P] **e2e + axe (WCAG 2.1 AA)**: Playwright `GEO_MODE=mock` — quickstart Scenario A end-to-end (create hosting event → discover → request → approve → address reveal) + Scenario E minyan regression; axe on kind picker, hosting form, hosting detail, requests panel, discovery filters. `apps/frontend/e2e/`.
- [ ] T046 [P] SHOULD: candle-lighting/Havdalah zmanim panel on a hosting event with a Shabbat/festival occasion, reusing 005's `GET /api/events/:id/zmanim` (no new backend). `apps/frontend/src/features/events/EventDetail.tsx`.
- [X] T047 [P] Notify pending requesters when a hosting gathering is moderation-hidden/host-suspended (reuse the cancel-notify path). `apps/backend/src/services/`.
- [X] T048 Run quickstart.md scenarios A–E manually via the app (`/run` or `pnpm dev`, `GEO_MODE=mock`); confirm SC-001..006. Deploy note: `pnpm db:migrate:remote` for 0014 (CI does not auto-migrate).

---

## Dependencies & order

- **Setup (T001–T002)** → **Foundational (T003–T016)** → **US4 regression gate (T017–T019)** → **US1 (T020–T032, incl. T031a/T031b)** → **US2 (T033–T038)** → **US3 (T039–T042)** → **Polish (T043–T048)**.
- US2 depends on the generalized discovery query (T011) + at least one non-minyan kind (US1's hosting event) to be meaningful. US3 is independent of US1/US2 once Foundational is done (can parallel US1 if staffed).
- **MVP = Setup + Foundational + US4 gate + US1** (host a hosting event + request/approve), **including T031a ("My events" — the host's reliable path back to the requests queue, FR-017) and T031b (request-flow emails, FR-014)** — the async re-engagement loop is part of the MVP. US2 completes the mission loop.

## Parallel opportunities

- Foundational shared contracts T003/T004/T006/T007 are `[P]` (different schema files); T005 depends on T003/T004.
- US1 tests T024/T025/T026 are `[P]` (independent test files); FE hooks/i18n T030/T031 `[P]`.
- Polish T043–T047 are largely `[P]`.

## Independent test criteria

- **US1**: create a hosting event, another user requests a seat, host approves → guest sees address; over-capacity waitlists; freed seat promotes (open) / enables approval (approval). (quickstart A+B)
- **US2**: a minyan + a hosting event + a social gathering near a point all list; filter by kind/occasion narrows correctly. (quickstart C)
- **US3**: social gathering open RSVP auto-confirms, waitlists past capacity. (quickstart D)
- **US4**: full minyan host→commit→quorum→readiness→cancel unchanged. (quickstart E / SC-005)
