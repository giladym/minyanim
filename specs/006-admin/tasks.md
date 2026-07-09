---
description: "Task list for Admin — Moderation, Curation & Metrics (Feature 006)"
---

# Tasks: Admin — Moderation, Curation & Metrics

**Input**: Design documents from `specs/006-admin/` (plan.md, spec.md, data-model.md, contracts/api.md).

**Prerequisites**: 001–005 + 008–010 shipped to `develop`. Branch `006-admin` (off `develop`). Builds
directly on the **010 admin foundation** (`lib/auth.ts` `requireAdmin`, `routes/admin.ts`,
`AdminLayout.tsx`, `useAdminMe`) and the **003 flag path** (`flag` table, `event.hidden`,
`flagRepository`, `FlagButton`) — do NOT rebuild auth or the flag affordance.

**Tests**: REQUESTED — SC-001…SC-005 + the acceptance scenarios mandate backend
(vitest-pool-workers), frontend (Vitest + Testing Library), and e2e (Playwright + axe). Test tasks are
included.

**Organization**: by user story (US1 flag P1 → US2 auto-hide P1 → US3 queue+actions P1 → US5 metrics
P3). **US4 is delivered by 010** — see the note; no implementation tasks. `[P]` = parallelizable
(different files, no incomplete dep). `[US#]` tags the owning story.

---

## Phase 1: Setup — Shared Contracts (`packages/shared`)

- [ ] T001 [P] Create `packages/shared/src/schemas/moderation.ts`: `ContentType = z.enum(["stay","event"])`; `FlagReason = z.enum(["spam","inappropriate","fake","other"])`; `UserStatus = z.enum(["active","suspended","banned"])`; `flagContentSchema = z.object({ reason: FlagReason, reportUser: z.boolean().optional() })`; `sanctionInputSchema = z.object({ suspendDays: z.number().int().positive().optional() })`; `ModerationQueueEntryDTO` (TS interface — contentType, contentId, reporterCount, reasons, hidden, reportedUserId, content:{city,country,title?}, createdAt). Export the inferred types. JSDoc. (data-model, contracts)
- [ ] T002 [P] Create `packages/shared/src/schemas/metrics.ts`: `AdminMetricsDTO` TS interface (users/stays/minyanim/funnel/moderation/topLocations — see contracts). Hand-built (no Zod; read-only projection).
- [ ] T003 [P] Extend `packages/shared/src/errors.ts`: add `ADMIN_LAST_ADMIN: "admin.last_admin"`, `USER_SUSPENDED: "user.suspended"`, `USER_BANNED: "user.banned"`, `FLAG_TARGET_INVALID: "flag.target_invalid"` under a `// 006 — Admin moderation` comment.
- [ ] T004 Export the new schemas from `packages/shared/src/schemas/index.ts`; run `pnpm --filter shared typecheck`. (depends on T001–T003)

---

## Phase 2: Foundational — flag reshape, stay.hidden, user.status, migration

**Purpose**: the polymorphic reasoned flag + the hideable-content + sanctionable-user columns every
story builds on.

**⚠️ CRITICAL**: complete + green before user-story work.

- [ ] T005 Reshape `flag` in `apps/backend/src/db/schema.ts`: replace `eventId` with `contentType text notNull` + `contentId text notNull`; add `reason text notNull` + `reportedUserId text references(user.id, onDelete cascade)` (nullable); keep `userId` (reporter) + `createdAt`; unique index `flag_content_user_uidx` on `(contentType, contentId, userId)` + index `flag_content_idx` on `(contentType, contentId)`. Add `hidden: integer boolean notNull default false` to `stay`. Add `status: text notNull default 'active'` + `suspendedUntil: integer timestamp` (nullable) to `user`. (data-model Changes 1–3)
- [ ] T006 Register `status` + `suspendedUntil` in `apps/backend/src/auth.ts` better-auth `user.additionalFields` with `input:false` (mirror `isAdmin` — never client-settable; only the sanction service writes them). (data-model Change 3)
- [ ] T007 Generate the migration (`pnpm --filter @minyanim/backend db:generate`) into `apps/backend/migrations/` — the next number is **`0011_*.sql`**. **VERIFY** the `stay.hidden`, `user.status`, `user.suspended_until` changes are single `ALTER TABLE … ADD COLUMN` statements (NOT a PRAGMA rebuild — `user`/`stay` have FK children; hand-author the one-line ALTERs if drizzle-kit emits a rebuild, per 004). A `flag` table rebuild is acceptable (flag has no children). Apply `pnpm --filter @minyanim/backend db:migrate:local`. (data-model migration note) (depends on T005, T006)
- [ ] T008 Widen `apps/backend/src/repositories/userRepository.ts` `updateUser` field type to include `status` + `suspendedUntil`; add `activeAdminCount(db)` (COUNT where `isAdmin` AND `status='active'`) and `setUserStatus(db, userId, status, suspendedUntil)`. (data-model FR-009 + enforcement)
- [ ] T009 Extend `apps/backend/src/repositories/flagRepository.ts`: replace `flagEvent`/`eventExists` with `flagContent(db, contentType, contentId, userId, reason, reportedUserId?)` (idempotent `onConflictDoNothing` on the new unique), `distinctReporterCount(db, contentType, contentId)`, `contentExists(db, contentType, contentId)` (dispatch to `stay`/`event` by type). (data-model Change 1) (depends on T005)

**Checkpoint**: schema + migration applied; flag/user repositories reshaped; typecheck green.

---

## Phase 3: User Story 1 — Flag Content or Report a User (Priority: P1) 🎯 MVP (with US2)

**Goal**: Any signed-in user flags a Stay or Minyan with a reason (+ optional user report); one flag
per reporter per item.

**Independent Test**: A user flags a spammy Minyan with reason "spam"; the flag is recorded once and
appears in the admin queue with the reason.

### Tests for User Story 1

- [ ] T010 [P] [US1] `apps/backend/test/flag.test.ts`: `POST /api/events/:id/flag {reason:"spam"}` records one flag; a repeat by the same reporter is idempotent (count stays 1); `POST /api/stays/:id/flag {reason:"fake"}` flags a Stay; a missing content id → 404; an invalid `reason` → 400; `reportUser:true` sets `reported_user_id` to the owner. (FR-001, US1.1–1.3)
- [ ] T011 [P] [US1] `apps/frontend/src/features/events/FlagButton.test.tsx` (or extend MinyanDetail test): the flag control shows a reason picker (spam/inappropriate/fake/other) and calls the mutation with the chosen reason.

### Implementation for User Story 1

- [ ] T012 [US1] Create `apps/backend/src/services/moderationService.ts` — `flagContent(ctx, contentType, contentId, userId, reason, reportUser)`: `contentExists` → 404 else `flagContent` insert; owner = `stay.userId`/`event.hostUserId`; `reportedUserId = reportUser ? owner : null`; then the auto-hide check (T015). (contracts, data-model)
- [ ] T013 [US1] Update `apps/backend/src/routes/events.ts` `POST /api/events/:id/flag`: parse `flagContentSchema`, delegate to `moderationService.flagContent(contentType:"event")` (remove the direct `flagRepository.flagEvent` call). (contracts)
- [ ] T014 [US1] Add `POST /api/stays/:id/flag` to `apps/backend/src/routes/stays.ts` (`requireUserId`, parse `flagContentSchema`, `moderationService.flagContent(contentType:"stay")`). (contracts)
- [ ] T015 [US1] Extend `apps/frontend/src/features/events/MinyanDetail.tsx` `FlagButton` with a reason picker; add a `FlagButton` (reason picker) to `apps/frontend/src/features/stays/StayCard.tsx`; wire both to their flag mutations in the FE data layer. i18n (`flag.reason.*`), tokens, ≥44px, keyboard.

**Checkpoint**: Stay + Minyan flagging with reasons; idempotent per reporter.

---

## Phase 4: User Story 2 — Auto-Hide at Threshold (Priority: P1) 🎯 MVP (with US1)

**Goal**: On the 3rd distinct reporter, the content is hidden from public/discovery views and marked
"pending review", WITHOUT sanctioning the owner.

**Independent Test**: Three different users flag the same Stay; it disappears from public discovery
and is marked auto-hidden in the queue, while the owner stays active and still sees it "under review".

### Tests for User Story 2

- [ ] T016 [P] [US2] `apps/backend/test/auto-hide.test.ts`: 2 distinct flags → content NOT hidden; the 3rd distinct reporter → `hidden=true` (SC-001); a 4th flag → still hidden, no error (idempotent); the owner is NOT suspended/banned (SC-002); an auto-hidden Stay drops from the discovery/travelers query; an auto-hidden event 404s to non-hosts (existing 003 behaviour, re-asserted).
- [ ] T017 [P] [US2] `apps/frontend/src/features/stays/StayCard.test.tsx`: a `hidden` Stay renders the "under review" banner (owner still sees the card — US2.2).

### Implementation for User Story 2

- [ ] T018 [US2] Extend `apps/backend/src/services/moderationService.ts` auto-hide: after the flag insert, `distinctReporterCount(...) >= 3` → `moderationRepository.setContentHidden(db, contentType, contentId, true)` (idempotent). Named `AUTO_HIDE_THRESHOLD = 3` constant. Never touch `user.status` here (SC-002). (data-model auto-hide rule)
- [ ] T019 [US2] Create `apps/backend/src/repositories/moderationRepository.ts` — `setContentHidden(db, contentType, contentId, hidden)` (writes `stay.hidden`/`event.hidden` by type), `clearFlags(db, contentType, contentId)`, and the queue query (Phase 5). (data-model)
- [ ] T020 [US2] Add `eq(stay.hidden, false)` to the three active-stay queries in `apps/backend/src/repositories/discoveryRepository.ts` (beside the existing `eq(stay.status,"active")`) so auto-hidden Stays leave discovery. (data-model Change 2)
- [ ] T021 [US2] Surface `hidden` on the owner Stay DTO in `apps/backend/src/services/stayService.ts` (`toOwnerDTO`) + the shared Stay owner type; render the "under review" banner in `StayCard.tsx` when `hidden`. (US2.2)

**Checkpoint**: content auto-hides at 3 distinct reporters; owner unaffected; discovery filtered. **MVP (US1+US2) shippable.**

---

## Phase 5: User Story 3 — Admin Moderation Queue & Actions (Priority: P1)

**Goal**: An admin reviews flagged/hidden content and takes action (dismiss/remove/warn/suspend/ban),
enforced, with the last-admin safeguard.

**Independent Test**: An admin opens the queue, reviews an auto-hidden Minyan, and either restores it
or removes it and suspends the owner; a suspended owner is then blocked from hosting.

### Tests for User Story 3

- [X] T022 [P] [US3] Queue tests — landed in `apps/backend/test/moderation-admin.test.ts` (one file for T022–T024 rather than three): `GET /api/admin/moderation` returns entries with reporter count + reasons + hidden flag, **auto-hidden first** then by count (FR-003); a non-admin → 403, signed-out → 401.
- [X] T023 [P] [US3] Action tests (in `moderation-admin.test.ts`): dismiss restores + clears flags (US3.4); remove hides + keeps flags; suspend sets status+until; ban sets banned; reinstate clears; **suspending/banning the last active admin → `admin.last_admin` (409)** (SC-005); missing user → 404.
- [X] T024 [P] [US3] Enforcement tests (in `moderation-admin.test.ts`): a suspended user's create-stay → 403 `user.suspended` (with `params.until`), banned user's host-minyan → 403 `user.banned`; reinstate unblocks. (FR-005)
- [X] T025 [P] [US3] `apps/frontend/src/features/admin/AdminManagers.test.tsx` (ModerationQueue block): a row renders reason + reporter count + auto-hidden badge; dismiss/ban buttons call the right mutations; empty-state renders.

### Implementation for User Story 3

- [X] T026 [US3] Created `apps/backend/src/lib/enforcement.ts` — `assertUserActive(db, userId)`: banned→`user.banned` (403); suspended & not expired→`user.suspended` (403, params `{until}`); suspended & expired→auto-clear to active + proceed; missing/active→proceed. (data-model enforcement)
- [X] T027 [US3] `assertUserActive` called at the top of create-stay (`stayService.createStay`), host-minyan (`eventService.hostMinyan`), and commit (`commitmentService.commit`). (FR-005)
- [X] T028 [US3] Extended `moderationRepository.ts`: `listFlagGroups` (aggregate by `(content_type, content_id)` → count + distinct reasons via `group_concat` + min(createdAt)), `eventSummaries`/`staySummaries` (hidden + city/country + owner), `setUserStatus`, `activeAdminCount`. (Sorting + content join is assembled in the service, not SQL.)
- [X] T029 [US3] Extended `apps/backend/src/services/moderationService.ts`: `getQueue` → sorted `ModerationQueueEntryDTO[]` (hidden desc, count desc, createdAt asc); `dismissContent` (hide=false + clearFlags); `removeContent` (hide=true); `sanctionUser(db, id, action, suspendDays?)` → warn/suspend/ban/reinstate via `setUserStatus`; **FR-009 guard** throws `LastAdmin` (409) when the target is the last active admin.
- [X] T030 [US3] Endpoints added to the existing `apps/backend/src/routes/admin.ts` (mounted already) rather than a new `routes/moderation.ts` — keeps the whole `/api/admin/*` surface + `requireAdmin` in one router: `GET /api/admin/moderation`; `POST …/moderation/:contentType/:contentId/{dismiss|remove}` (contentType narrowed to stay|event → 404); `POST …/users/:id/{warn|suspend|ban|reinstate}` (parse `sanctionSchema`; every action logged FR-008).
- [X] T031 [US3] Created `apps/frontend/src/lib/moderation.ts`: `useModerationQueue`, `useContentAction`, `useSanctionUser`. Error codes (`admin.last_admin`, `user.*`, `auth.forbidden`) mapped in the i18n `errors` block.
- [X] T032 [US3] Created `apps/frontend/src/features/admin/ModerationQueue.tsx`: cards (auto-hidden first), reason list + reporter count + hidden badge, per-row dismiss/remove + per-owner warn/suspend/ban (ban confirm). Tab added to `AdminLayout.tsx` + `/admin/moderation` route. RTL, tokens, i18n, keyboard. (SC-003) — i18n keys live under the existing `moderation.*` namespace (not `admin.moderation.*`).
- [X] T033 [US3] The enforcement codes (`user.suspended`/`user.banned`) now surface their specific message on the create-stay + host-minyan forms (`applyApiError` renders `errors.user.*` for non-field enforcement codes instead of the generic notice), informing the sanctioned user (FR-005).

**Checkpoint**: full moderation loop — flag → auto-hide → queue → action → enforcement, with the last-admin safeguard.

---

## Phase 6: User Story 5 — Basic Metrics (Priority: P3)

**Goal**: An admin sees v1 platform-health counts + the quorum funnel + top locations.

**Independent Test**: An admin opens the metrics view and sees current counts for users, stays,
minyanim, and minyanim that reached quorum.

### Tests for User Story 5

- [ ] T034 [P] [US5] `apps/backend/test/metrics.test.ts`: `GET /api/admin/metrics` returns the counts (seed a few users/stays/minyanim → assert totals, funnel.quorum = ready-count, hidden counts); non-admin → 403.
- [ ] T035 [P] [US5] `apps/frontend/src/features/admin/AdminMetrics.test.tsx`: metric cards + funnel + top locations render from a mocked DTO.

### Implementation for User Story 5

- [ ] T036 [US5] Create `apps/backend/src/services/metricsService.ts` — aggregate D1 counts: users (total/admins/suspended/banned), stays (total/active/hidden), minyanim (by status + hidden), funnel (potential = active stays / hosted = events / quorum = ready events), moderation (open flags / auto-hidden), top locations by activity. (contracts DTO)
- [ ] T037 [US5] Add `GET /api/admin/metrics` to `apps/backend/src/routes/moderation.ts` (or a small `routes/metrics.ts`) behind `requireAdmin`; hand-build `AdminMetricsDTO`. (contracts)
- [ ] T038 [US5] `apps/frontend/src/features/admin/AdminMetrics.tsx` + `useAdminMetrics` query; add the tab to `AdminLayout.tsx` + the `/admin/metrics` route. RTL, tokens, i18n. (SC — north-star quorum highlighted)

**Checkpoint**: metrics view live under the `/admin` shell.

---

## User Story 4 — Curate Beit Chabad Pins (Priority: P2) — ✅ DELIVERED VIA 010

**No implementation tasks.** 010's `AdminPlacesManager` (`GET/POST/PATCH/DELETE /api/admin/places` +
`/api/admin/layers`, frontend `/admin/places`) already lets an admin add/edit/remove places in the
"Chabad houses" layer, and they render on the public map — satisfying FR-006 (curation) and SC-004
(edits appear on the map). 006 adds nothing here. Fully retiring the standalone `beit_chabad_pin`
table and folding its pins into `place` (the seed import) is **Feature 011** — out of scope for 006.
(Only action for 006: a one-line note in `CLAUDE.md`/ROADMAP at merge that US4 is covered by 010.)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T039 [P] i18n he+en parity in `apps/frontend/src/i18n/locales/{he,en}.ts`: `flag.reason.{spam,inappropriate,fake,other}`, `admin.moderation.{tab,title,empty,autoHidden,reporters,dismiss,remove,warn,suspend,ban,reinstate,lastAdmin}`, `admin.metrics.{tab,title,users,stays,minyanim,funnel,quorum,topLocations}`, `user.status.{suspended,banned,bannerSuspended,bannerBanned}`; the existing parity test must pass.
- [ ] T040 [P] e2e `apps/frontend/e2e/admin-moderation.spec.ts` (Playwright + axe): an admin opens the moderation queue + metrics tabs → WCAG 2.1 AA + RTL + keyboard clean (constitution a11y gate); the queue action flow works end-to-end.
- [ ] T041 Run the quickstart scenarios against `pnpm dev`; fix drift. Update `CLAUDE.md` (006 active→complete + US4-via-010 note) and `ROADMAP.md` at merge time only.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001/T002/T003 [P]; T004 after them.
- **Phase 2 (Foundational)**: T005→T006→T007 (migration); T008, T009 after T005. BLOCKS all stories.
- **US1 (Phase 3)**: after Phase 2. Tests T010/T011 [P]; T012→T013→T014→T015.
- **US2 (Phase 4)**: after US1 (shares `moderationService`). Tests T016/T017 [P]; T018 needs T019;
  T020, T021 [P] after.
- **US3 (Phase 5)**: after Phase 2 (queue/actions independent of US1 UI; reuses `moderationRepository`
  + `flag` shape). Tests T022–T025 [P]; T026→T027; T028→T029→T030; T031→T032; T033.
- **US5 (Phase 6)**: after Phase 2 (independent of US1–US3). Tests T034/T035 [P]; T036→T037→T038.
- **US4**: none (010).
- **Polish (Phase 7)**: after the stories it covers; T039/T040 [P]; T041 last.

### Within each story

Tests written first/with impl → repository → service → route → frontend data layer → UI.

### Parallel opportunities

- Setup: T001, T002, T003 together.
- Foundational: T008 ∥ T009 (different files) after T005.
- Each story's test tasks ([P]) together. US1/US2/US3 backend all touch `moderationService.ts`
  (coordinate: US1 adds `flagContent`, US2 adds auto-hide, US3 adds queue/actions — same file).
- US5 (metrics) is fully independent of the moderation stories and can proceed in parallel once
  Phase 2 lands.

---

## Implementation Strategy

**MVP** = Phase 1 + Phase 2 + **US1 + US2** (flag-with-reason for Stay + Minyan, and the 3-distinct
auto-hide) — the moderation *input* + protection, shippable and independently testable, delivering
SC-001/SC-002. Then **US3** (queue + actions + enforcement + last-admin guard — SC-003/SC-005),
completing the operational loop. Then **US5** (metrics — P3). **US4 needs no work** (010's places
manager already delivers it; `beit_chabad_pin` retirement is 011). Validate each story at its
checkpoint; keep the gate green (typecheck + lint + per-file backend tests + the WCAG-AA e2e gate).
All admin surfaces stay behind `requireAdmin`; sanctions are always admin-initiated (never auto —
SC-002); the system never reaches zero active admins (SC-005).
