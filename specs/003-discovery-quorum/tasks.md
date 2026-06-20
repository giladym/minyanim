---
description: "Task list for Discovery & Quorum Formation (003)"
---

# Tasks: Discovery & Quorum Formation

**Input**: Design documents from `specs/003-discovery-quorum/`
**Prerequisites**: plan.md, spec.md (Clarified D1–D22), research.md (R1–R15), data-model.md, contracts/api.md

**Tests**: Included where the constitution mandates or correctness demands — WCAG 2.1 AA
(Principle II), cascade-delete (account-deletion guarantee), the **readiness decision-table**
(SC-004, the core correctness risk), **concurrency** (unique-constraint / atomic claim, SC-004),
**notification idempotency** (SC-003), and **privacy non-exposure** (SC-005). Not full TDD per unit.

**Organization**: by user story (spec priorities). Stack & paths per [plan.md](./plan.md): monorepo
`apps/frontend`, `apps/backend`, `packages/shared`. Builds on 001 + 002. Generic `event`
(type=`minyan`) model throughout (D21). **Pre-launch: no real data — migrations may drop/recreate.**

## Format: `[ID] [P?] [Story] Description with file path`
- **[P]** = parallelizable (different files, no incomplete-task dependency)
- **[USx]** = user-story phase tasks only

---

## Phase 1: Setup

- [x] T001 [P] Create `packages/shared/src/config.ts` with planning constants (`DISCOVERY_RADIUS_KM=15`, `NEAR_QUORUM=8`, `QUORUM=10`, `PARTY_SIZE_MAX=50`, `COORD_GROUP_DP=4`, `POLL_DISCOVERY_MS=8000`, `POLL_DETAIL_MS=5000`) **and add `export * from "./config"` to `packages/shared/src/index.ts`** (today it only re-exports `./errors` + `./schemas/index`) so they import as `@minyanim/shared`
- [x] T002 [P] Verify config: `wrangler.jsonc` already has `GEO_MODE` (set `mock` for e2e per T046) and `RESEND_API_KEY` is in `.dev.vars.example`; MapLibre/Resend/`@photostructure/tz-lookup` already present — **no new infra binding** (D5/D6)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Must complete before any user story.**

- [x] T003 Extend shared error codes in `packages/shared/src/errors.ts`: `commitment.duplicate`, `commitment.conflict`, `role.already_claimed`, `minyan.cancelled`, `minyan.completed`, `party_size.invalid`, `not_committed` + matching `errors.*` he/en keys in `apps/frontend/src/i18n/locales/{he,en}.ts` (R13)
- [x] T004 [P] Shared Zod enums + event schemas in `packages/shared/src/schemas/event.ts`: `eventType`/`tefilla`/`nusach`/`role`/`notificationKind` enums, `MinyanServiceSchema` (`{tefilla, time?}`, optional-time regex), `MinyanAttrsSchema` (nusach, seferTorah, **services[] ≥1**), `CreateEventInput` (date + notes + minyan)/`UpdateEventInput`, `PublicMinyanDTO`/`ParticipantMinyanDTO`/`OwnerMinyanDTO` — DTOs MUST include `services`, `notes`, derived `committedMen`, `status`, `isShabbatShacharit`, `missingForReady {menShort, seferTorah, baalKorei}` (FR-006) (R1/R4/R10/R13)
- [x] T005 [P] Shared schemas `packages/shared/src/schemas/commitment.ts` (`CreateCommitmentInput` numMen 1..50, `CommitmentDTO`), `discovery.ts` (`DiscoveryQuery`, `PotentialBucket`, `DiscoveryResult`), `notification.ts` (`NotificationDTO`) (R6/R13)
- [x] T006 D1 schema in `apps/backend/src/db/schema.ts`: `event`, `minyan` (1:1), `commitment`, `event_role`, `notification`, `notification_event_log`, `flag`, `beit_chabad_pin` — FKs + `ON DELETE` rules + unique constraints (`commitment(event_id,user_id)`, `event_role(event_id,role)`, `notification_event_log(event_id,kind,threshold)`, `flag(event_id,user_id)`); **named indexes** `event(host_user_id)`, **`event(lat,lng)`** + **`event(status,type,event_date)`** (the SC-001 scan path), `commitment(event_id)`/`commitment(user_id)`, `notification(recipient_user_id)`; add **`stay(lat,lng)`** index (D15 seam) per data-model
- [x] T007 Generate + apply migration (`drizzle-kit generate`; `wrangler d1 migrations apply minyanim --local`) → `apps/backend/migrations/` (migration both **alters the existing `stay` table** to add its index and creates the new tables; drop/recreate acceptable — no real data). Ensure `apps/backend/test/apply-migrations.ts` glob picks up the new migration so the vitest-pool-workers D1 has the tables
- [x] T008 [P] Extend `apps/backend/src/lib/timezone.ts`: add `isSaturday(epoch)` + `shabbatSaturdaysInRange(arrival, departure, from, to)` (tz-free, UTC-midnight convention) + unit tests (R3)
- [x] T009 [P] `apps/backend/src/lib/context.ts`: `Ctx = { db, env, log, defer }`, builder from Hono `c` (`defer = c.executionCtx.waitUntil.bind(c.executionCtx)`) (R8/R14)
- [x] T010 [P] **Create `apps/backend/src/lib/auth.ts`** exporting `requireUserId(c)` (lift the copy currently inlined in `routes/stays.ts`/`me.ts`/`geo.ts`) **and** new `optionalUserId(c): string | null` (never throws — public join-link read; precedent `routes/calendar.ts`). 003 routes import from it (R11)
- [x] T011 [P] Notification email in `apps/backend/src/lib/notification-email.ts`: he/en templates for `quorum_reached`/`near_quorum`/`quorum_lost`/`cancelled`, **parameterizing the existing `apps/backend/src/lib/email-templates.ts#shell()` for `dir`/`lang`** (today it hardcodes `dir="rtl" lang="he"`), keyed by `user.language`; **refactor `lib/email.ts#sendEmail` behind an injectable `EmailSender` interface** (the test seam T036 depends on) (R8)

**Checkpoint**: contracts + schema + shared infra (Ctx, email, tz helpers, optional auth) ready.

---

## Phase 3: User Story 1 — Discover Potential & Existing Minyanim (P1) 🎯 MVP

**Goal**: Search an area + dates → per-Shabbat potential + hosted Minyanim on a map + list.
**Independent Test**: with seeded Stays + events, `GET /api/discovery` returns bucketed potential
+ address-free `PublicMinyanDTO[]` + Beit Chabad pins within 2 s; UI renders map/list parity.

- [x] T012 [US1] `apps/backend/src/repositories/eventRepository.ts` reads: list by bbox + filters (status/type/hidden/date), `getById`; grouped `SUM(num_men)` per event + batched `event_role` (R15)
- [x] T013 [US1] `apps/backend/src/services/discoveryService.ts`: bbox derivation (`cos(lat)` floor, antimeridian out-of-scope), coordless city/country union + dedupe, Shabbat bucketing via tz-free `shabbatSaturdaysInRange`, readiness derive (R4); exclude hidden/cancelled in SQL and **`completed` in-service** via `civilDate(event_date,"UTC") < todayCivil(tzFromCoords(event.lat,event.lng))` (event-coords tz, not the stay/UTC path) (R2/R3/R15)
- [x] T014 [US1] Discovery controller + route `GET /api/discovery` in `apps/backend/src/routes/discovery.ts` (authenticated; `PublicMinyanDTO`; `discovery.query` structured log) + mount in `index.ts`
- [x] T015 [P] [US1] Backend test `apps/backend/test/discovery.test.ts`: bbox + Saturday bucketing (`vi.setSystemTime`, date-line coords) + coordless union + hidden/cancelled **and `completed` (date-passed)** exclusion; **assert counts come from one grouped query + one batched role read (no N+1, R15)** by spying query count (SC-001 shape)
- [x] T016 [US1] *(list-first shipped; the multi-pin MapLibre map — FR-018 — is a documented follow-up, not yet built)* Frontend `apps/frontend/src/features/discovery/` (map reusing MapLibre + list parity + filters + per-Shabbat potential + Beit Chabad layer + ODbL attribution) + `apps/frontend/src/lib/discovery.ts` TanStack Query hook: key `["discovery", params]`, `refetchInterval: POLL_DISCOVERY_MS`, `refetchIntervalInBackground:false`, `refetchOnWindowFocus`; `aria-live="polite"` count region + keyboard-reachable `<button>` pins (list is the parity surface); i18n `discovery.*` (he/en)
- [x] T017 [P] [US1] FE unit test (Vitest+TL): discovery list + filters render/apply **and the query hook carries the polling config**; wire `/discovery` route in `apps/frontend/src/router.tsx` (child of `authedLayout`)

**Checkpoint**: discovery works against seeded data (independently testable).

---

## Phase 4: User Story 2 — Host a Minyan (P1)

**Goal**: Create a single-service Minyan at a precise point; host auto-committed; appears in discovery.
**Independent Test**: `POST /api/events` → `201 OwnerMinyanDTO`, host count=1, visible in discovery.

- [x] T018 [US2] `eventRepository` writes: create (event+minyan+host commitment via **non-atomic `db.batch`**, DTO from inputs — R6), `update` (PATCH), `cancel` (status + `db.batch` void commitments/roles)
- [x] T019 [US2] `apps/backend/src/services/eventService.ts`: host (structural Zod + temporal reuse 002 `assertNotPast`; coords mandatory), **derived status/readiness** (R4 truth table), `PATCH` edit (Sefer Torah toggle → recompute), cancel cascade (D11), **DTO selection** owner/participant/public by membership (R10)
- [x] T020 [US2] Events controller + routes in `apps/backend/src/routes/events.ts`: `POST /api/events`, `GET /api/events/:id` (**`optionalUserId`** → shape by relationship), `PATCH /api/events/:id` (host-only), `POST /api/events/:id/cancel` (idempotent; `confirm`). **Build `Ctx` (T009) in the controller and pass it into `eventService`** (needed by T034 fan-out). Mount in `index.ts` (`import { events } from "./routes/events"; app.route("/", events)`). Temporal check uses the event's mandatory coords for tz — **no `X-Client-Timezone`** (per contracts)
- [x] T021 [P] [US2] Backend test `apps/backend/test/events.test.ts`: host + **24-row SC-004 readiness decision-table** + PATCH Sefer-Torah-toggle recompute + cancel + **`PublicMinyanDTO` privacy non-exposure** (SC-005) + ownership-404
- [x] T022 [US2] Frontend `apps/frontend/src/features/events/HostMinyanForm.tsx` (reuse `LocationPicker`; date, **services editor — add/remove tefillot each with an optional time**, nusach, Sefer Torah, notes, party size; shared-Zod validation → keyed errors) + i18n `events.*`
- [x] T023 [US2] Frontend Minyan detail page (`MinyanDetail.tsx`, Public/Participant/Owner views, edit + cancel for host) + `apps/frontend/src/lib/events.ts` hook: key `["event", id]`, `refetchInterval` returns **`false` once `status ∈ {completed,cancelled}`** (else `POLL_DETAIL_MS`), `refetchIntervalInBackground:false`, mutations `invalidateQueries`. Wire `/minyan/:id` as a **public route under `rootRoute` (NOT `authedLayout`)** so the pre-auth join link renders (D13/DEV-12)

**Checkpoint**: hosting + the discover→host loop works.

---

## Phase 5: User Story 3 — Commit to / Leave a Minyan (P1)

**Goal**: Join with a party size (no Stay required), change it, withdraw; counts + status recompute.
**Independent Test**: commit 3 → count +3 within poll; withdraw → −3; address reveals on commit.

- [x] T024 [US3] `apps/backend/src/repositories/commitmentRepository.ts`: insert (unique), update size, delete, list by event/user, `reconcileCommitmentsForStay(ctx, stayId)`
- [x] T025 [US3] `apps/backend/src/services/commitmentService.ts`: commit (unique→`commitment.duplicate`; reject cancelled/completed; **conflict** = another active commitment on the same `event_date`, D14; reveal address), change size, withdraw (release held roles + recompute), invoke crossing detection (R9)
- [x] T026 [US3] Commitment routes appended to `routes/events.ts`: `POST`/`PATCH`/`DELETE /api/events/:id/commit` (single envelope `{minyan, conflict}`; `not_committed`). **`conflict` is a returned boolean flag + i18n key — NOT a 4xx throw.** Pass `Ctx` into `commitmentService` (serialize after T020 — same file)
- [x] T027 [US3] **MODIFY 002 chain** to thread `Ctx` and reconcile: `apps/backend/src/routes/stays.ts` + `controllers/stayController.ts` build/pass `Ctx`; `services/stayService.ts` `cancelStay`/`updateStay` (signatures change from `(db,…)` to include `Ctx`) call `commitmentService.reconcileCommitmentsForStay(ctx, stayId)` after their write (D12/R9 — auto-withdraw on date-coverage loss + notify). **Name all three files; this is a 002 retrofit, not a one-line add.** Depends on T024/T025
- [x] T028 [P] [US3] Backend test `apps/backend/test/commitment.test.ts`: commit/change/withdraw; **duplicate via `Promise.all`** (unique constraint, row-count 1); conflict warning; reject cancelled; **Stay-cancel → auto-withdraw reconciliation**
- [x] T029 [US3] Frontend commit/withdraw/change-size UI on Minyan detail (party size, conflict warning, missing-for-ready display FR-006); count via polling + `aria-live`; i18n

**Checkpoint**: full P1 quorum loop (discover → host → commit) works.

---

## Phase 6: User Story 4 — Claim a Prayer Role (P2)

**Goal**: A committed participant claims/releases Ba'al Tefila / Ba'al Korei; readiness recomputes.
**Independent Test**: claim Ba'al Korei on a 10-man Shabbat-Shacharit Torah minyan → status `ready`.

- [x] T030 [US4] `apps/backend/src/repositories/roleRepository.ts` (claim via `onConflictDoNothing().returning()` empty-array check; release delete) + `apps/backend/src/services/roleService.ts` (caller-must-be-committed; recompute readiness; auto-release on withdraw)
- [x] T031 [US4] Role routes appended to `routes/events.ts`: `POST`/`DELETE /api/events/:id/roles/:role` (`role.already_claimed`, `not_committed`); pass `Ctx` into `roleService` (serialize after T020/T026 — same file)
- [x] T032 [P] [US4] Backend test `apps/backend/test/role.test.ts`: **concurrent claim via `Promise.all`** (exactly one holder); release reopens + readiness recompute; auto-release on withdrawal; user may hold both roles
- [x] T033 [US4] Frontend role claim/release UI on Minyan detail (open-slot indicators; Ba'al Tefila display-only in readiness) + i18n `roles.*`

**Checkpoint**: readiness (10 + Torah + Korei) reachable for Shabbat-Shacharit.

---

## Phase 7: User Story 5 — Quorum Notifications (P2)

**Goal**: Email + in-app notifications on quorum-reached / near / lost / cancelled, exactly once.
**Independent Test**: cross 10 → host + participants get an in-app row + (mocked) email once.

- [x] T034 [US5] `apps/backend/src/services/notificationService.ts`: crossing detection (prev→new), idempotency log (`onConflictDoNothing().returning()`), **sync in-app `notification` rows** + **deferred email via `Ctx.defer`** (per-recipient try/catch + `notification.*` structured logs), down-cross clears log + fires `quorum_lost`; wire into commit/change/withdraw/role/PATCH/cancel/reconcile (depends on `Ctx` already threaded by T020/T026/T031/T027) (R8/R9/R14)
- [x] T035 [US5] Notification routes `apps/backend/src/routes/notifications.ts`: `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`; mount in `index.ts` (`app.route("/", notifications)`)
- [x] T036 [P] [US5] Backend test `apps/backend/test/notification.test.ts`: **idempotency oscillating around BOTH 10 and 8** (each fires once, no re-fire); `quorum_lost` on down-cross; `cancelled` fan-out; **email via injected/mocked `EmailSender`** asserting recipients + `lang` + `kind` + call-count (SC-003)
- [x] T037 [US5] Frontend `apps/frontend/src/features/notifications/` inbox (route `/notifications` under `authedLayout` in `router.tsx`) + **unread-count badge on the existing `nav.notifications` item in `apps/frontend/src/components/AppShell.tsx`** (and convert nav `<a>`→`<Link>` for SPA nav/`aria-current`) + polling; i18n `notifications.*` (in-app strings in FE i18n; email copy stays in backend templates)

**Checkpoint**: notifications deliver exactly-once and recompute downward.

---

## Phase 8: User Story 6 — Share a Minyan via WhatsApp (P2)

**Goal**: One-tap WhatsApp share with public details + join link; recipient lands ready to commit.
**Independent Test**: share opens `wa.me` with public info (no address) + `/minyan/:id`; recipient signs in (Google OR email/password) → lands on the Minyan.

- [x] T038 [US6] Frontend "Share to WhatsApp" action on Minyan detail: build `wa.me/?text=` from `PublicMinyanDTO` (public location/date/tefilla/time/count + `/minyan/:id`) — **never** the address; i18n share template (he/en)
- [x] T039 [US6] Join-link landing: unauthenticated `/minyan/:id` shows public view + sign-in CTA; post-auth redirect to `/minyan/:id` (reuse `apps/backend/src/lib/redirect.ts` + `optionalUserId`); works for Google **and** email/password (D13/R11)
- [x] T040 [P] [US6] Test: share message excludes `addressPrivate` (SC-005); e2e join-redirect (Playwright) for both auth methods

**Checkpoint**: recruitment share + join loop works.

---

## Phase 9: User Story 7 — Find Minyanim near my Stay (P2)

**Goal**: From an owned Stay, see nearby Minyanim/potential and deep-link into pre-filtered discovery.
**Independent Test**: a Stay shows "N Minyanim near this stay"; tapping opens discovery pre-filtered.

- [x] T041 [US7] `discoveryService`: `nearStay(stayId)` (potential + minyanim for the Stay's location/dates) + `nearStayCounts(userId)` (batched, R15)
- [x] T042 [US7] Routes in `routes/discovery.ts`: `GET /api/discovery/near-stay/:stayId` (ownership-404), `GET /api/discovery/near-stay-counts`
- [x] T043 [US7] Frontend: extend `apps/frontend/src/features/stays/StayCard.tsx`/dashboard with "N Minyanim near this stay" link (from batched counts) → pre-filtered `/discovery`; empty → potential + prompt-to-host (no dead end); i18n
- [x] T044 [P] [US7] Test: near-stay counts batched (no N+1), ownership-404, empty-minyanim returns potential

**Checkpoint**: the Stay→discovery reciprocal loop closes.

---

## Phase 10: Polish & Cross-Cutting

- [x] T045 [P] **Cascade-orphan integration test** `apps/backend/test/event-cascade.test.ts`: create user + event + minyan + commitments + roles + notifications → `deleteUser` → assert zero orphans across **all** new tables (extends 002 T029)
- [x] T046 [P] **axe WCAG 2.1 AA** e2e `apps/frontend/e2e/discovery.spec.ts`: discovery map/list, host form, commit, notifications at 375px + desktop; keyboard pins + map/list parity + RTL (SC-007; `GEO_MODE=mock`)
- [x] T047 [P] i18n audit: all new FE strings + the 4×2 email templates keyed (he/en, recipient language); tokens-only colors (no hardcoded)
- [x] T048 Confirm structured log events emitted: `discovery.query`, `event.hosted`, `commitment.changed`, `notification.fanout`, `notification.idempotent_skip`, `notification.email_failed` (R14)
- [x] T049 [P] Seed `beit_chabad_pin` (dev seed, source-decoupled — D18) + verify the static map layer renders
- [x] T050 Run `quickstart.md` scenarios 1–6 end-to-end locally (`GEO_MODE=mock`); verify SC-001…SC-007
- [x] T051 Update OpenAPI/Swagger note + `docs` if needed; ensure `pnpm typecheck && lint && test` green; push (CI + Workers Builds preview deploy from `003-…`; verify on develop after merge)

---

## Phase 11: FR-017 Flag affordance & moderation seam (cross-cutting, P2)

**Goal**: users can flag a Minyan; discovery excludes moderation-`hidden` content. The 3-flag
auto-hide threshold + moderation UI are **Feature 006** — 003 ships only the write + read-exclusion
(D19). Executes after events exist (US2) — listed here for cohesion, not last in execution order.

- [x] T052 [US1] Flag route `apps/backend/src/routes/flags.ts` (or appended to `routes/events.ts`): `POST /api/events/:id/flag`, idempotent on `UNIQUE(event_id,user_id)` (repeat → `200`); mount in `index.ts`
- [x] T053 [US1] Frontend "flag" affordance on the discovery card + `MinyanDetail.tsx` (i18n `flag.*`); discovery already excludes `event.hidden` (T013) — verify the read-exclusion contract
- [x] T054 [P] [US1] Backend test `apps/backend/test/flag.test.ts`: flag + idempotent re-flag (200, one row); a `hidden=1` event is absent from discovery results

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T011)** → user stories.
- Within Foundational: T003/T004/T005 (shared contracts) and T006 (schema) first; T007 (migration) after T006; T008/T009/T010/T011 [P] (libs) independent.
- **US1 (T012–T017)** is the MVP slice (discovery, testable with seeded data). The true first
  deliverable is the **P1 trio US1+US2+US3** (discover → host → commit).
- US2 (T018–T023) and US3 (T024–T029) depend on Foundational; US3's reconciliation (T027) edits the
  002 `routes/stays.ts`+`stayController.ts`+`stayService.ts` chain to thread `Ctx`. US4 (roles)
  depends on US3 (commitment). US5 (notifications) depends on US3/US4 (crossing sources) + T011
  (email) + T009 (`Ctx`), **and on `Ctx` already being threaded by T020/T026/T031/T027** (the fan-out
  call-sites). US6 (share) depends on US2 (detail page). US7 depends on US1 (discovery service) + 002
  dashboard.
- **Flag (T052–T054, Phase 11)** can start after US2 (needs events to flag); not gated on Polish.
- **Polish (T045–T051)** last.

## Parallel Opportunities

- T001/T002 together (setup).
- T004/T005 together (shared schemas, different files); T008/T009/T010/T011 together (libs).
- Backend test tasks [P] (T015, T021, T028, T032, T036, T040, T044, T054) parallel with their story's UI.
- Once Foundational completes, US1/US2/US3 backend vs frontend can progress in parallel.

**Serialization points (NOT parallel — same file):** T020/T026/T031/T052 all edit
`apps/backend/src/routes/events.ts` (serialize in that order). T016/T023/T029/T033/T038/T053 all
add to the frontend Minyan/discovery surfaces and `MinyanDetail.tsx`. T003/T016/T022/T029/T033/
T037/T043/T053 all touch `i18n/locales/{he,en}.ts` — keep the **T047 i18n audit strictly last and
non-parallel** with story FE tasks. Route mounts in `index.ts` (T014/T020/T035/T052) and
`router.tsx` wirings (T017/T023/T037) also serialize per file.

## Implementation Strategy

MVP = Setup + Foundational + US1 (discovery renders with seeded data). The usable product loop is
the **P1 trio** (US1+US2+US3). P2 stories (US4 roles, US5 notifications, US6 share, US7 near-stay)
layer on independently. Honor every Clarification (D1–D22) + research decision (R1–R15); geocoding
mocked via `GEO_MODE=mock`; email injected/mocked in tests.

## Notes

- Generic `event` (type=`minyan`) throughout; user-facing copy "מניין" (D21).
- No interactive D1 transactions — `db.batch` (non-atomic) + unique constraints + `onConflictDoNothing().returning()` (D9/R5/R6).
- Notifications: in-app rows sync, email deferred via `Ctx.defer`, idempotent per crossing (R8).
- Pre-launch: no real data — drop/recreate migrations acceptable.
