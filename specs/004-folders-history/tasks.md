---
description: "Task list for Folders & History (Feature 004)"
---

# Tasks: Folders & History

**Input**: Design documents from `specs/004-folders-history/` (plan.md, spec.md, research.md
R1–R12, data-model.md, contracts/api.md, quickstart.md).

**Prerequisites**: 001 Platform + 002 Stays + 003 Minyanim shipped to `develop`. Branch
`004-folders-history` (off `develop`).

**Tests**: REQUESTED — the spec (SC-001…SC-007), plan, and quickstart mandate backend
(vitest-pool-workers), frontend (Vitest + Testing Library), and e2e (Playwright + axe) coverage.
Test tasks are included and, per project convention, written before/with their implementation.

**Organization**: Tasks grouped by user story (US1 P1 → US2 P2 → US3 P3) so each is an
independently testable increment. `[P]` = parallelizable (different files, no incomplete-dep).

---

## Phase 1: Setup — Shared Contracts (`packages/shared`)

**Purpose**: Single source of truth (Zod) consumed by both apps. Blocks all backend + frontend work.

- [x] T001 [P] Create `packages/shared/src/schemas/folder.ts`: `FolderDTO { id, name, stayCount, createdAt }`; `CreateFolderInput = z.object({ name: z.string().trim().min(1,"folder.name_required").max(60,"folder.name_too_long") })`; `UpdateFolderInput` (same shape). JSDoc each export. (R8)
- [x] T002 [P] Extend `packages/shared/src/schemas/stay.ts`. **NOTE: `OwnerStayDTO`/`PublicStayDTO` are TypeScript `interface`s, not Zod schemas** (`toPublicStayDTO` is a hand-written projection) — so: add `historyTag: "attended" | "cancelled" | null;` as an **interface field** on `OwnerStayDTO` (NOT on `PublicStayDTO`); add `HistoryPage` as a TS `interface { stays: OwnerStayDTO[]; nextCursor: string | null }` (the controller hand-builds it, like `toOwnerResponse` — there is no `.parse()`); add `StayScope = z.enum(["active","history"])` (a new standalone Zod value, legitimate). Document the cursor format `base64("${departureDateMs}_${id}")`. (R6/R8)
- [x] T003 [P] Extend `packages/shared/src/errors.ts` `ERROR_CODES` (a const map of `SCREAMING_CASE: "dotted.value"`): add `FOLDER_NAME_TAKEN: "folder.name_taken"`, `FOLDER_NAME_REQUIRED: "folder.name_required"`, `FOLDER_NAME_TOO_LONG: "folder.name_too_long"`, `STAY_NOT_CANCELLED: "stay.not_cancelled"`. `RESOURCE_NOT_FOUND`/`CONFIRM_REQUIRED` already exist (reuse). (D12/R8)
- [x] T004 Export the new folder schema + stay additions from `packages/shared/src/index.ts` (barrel); run `pnpm --filter shared typecheck`. (depends on T001–T003)

---

## Phase 2: Foundational — DB schema, migration, cache seam

**Purpose**: The `folder` table, the `stay.folder_id` FK rebuild, and the frontend cache-key seam
that both US1 and US2 build on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete and green.

- [x] T005 In `apps/backend/src/db/schema.ts`: add `folder` table (`id` text PK `fld_…`, `userId` FK→`user` ON DELETE CASCADE, `name` text NOT NULL, `createdAt`/`updatedAt`); add `folder_user_idx (user_id)`; add `stay.folderId.references(() => folder.id, { onDelete: "set null" })`; add `stay_user_folder_idx (user_id, folder_id)` + `stay_user_departure_idx (user_id, departure_date, id)`. (data-model; the NOCASE unique index is raw SQL in the migration, T006). (R1/R2/R12)
- [x] T006 Author migration in **`apps/backend/migrations/`** (the drizzle `out` dir — `0000`–`0003` live there; `drizzle.config.ts out: "./migrations"`, and the test harness reads it via `readD1Migrations("./migrations")`, so a file under `src/migrations/` is silently ignored by BOTH wrangler and tests). Run `pnpm db:generate` so drizzle-kit creates the `0004_<word>.sql` file **and journals it in `migrations/meta/_journal.json`** (don't hand-create the file, or the harness skips it), then **rewrite its SQL body in place as a clean drop/recreate in dependency order** — drop `commitment` + `stay`; create `folder`; recreate `stay` (with `folder_id` FK `ON DELETE SET NULL` + all prior indexes `stay_user_idx`/`stay_user_arrival_idx`/`stay_lat_lng_idx` + `stay_user_folder_idx` + `stay_user_departure_idx`); recreate `commitment` (with its `stay_id` FK **`ON DELETE SET NULL`** — matching shipped `schema.ts`, the D8 permanent-delete relies on it); add `CREATE UNIQUE INDEX folder_user_name_uidx ON folder(user_id, name COLLATE NOCASE)`. **Strip any `PRAGMA foreign_keys` lines** (D1 rejects them). Apply with `pnpm db:migrate:local`. (R3/R2/D5)
- [x] T007 Migration-integrity test in `apps/backend/test/`: after migrations, assert `PRAGMA foreign_key_list(commitment)` still shows `stay_id → stay` **with `on_delete = 'SET NULL'`** (not just existence — a CASCADE recreate would silently change D8 semantics), and the `stay`/`folder` indexes exist. (R3/R12)
- [x] T008 [P] Refactor `apps/frontend/src/lib/stays.ts`: migrate the flat `STAYS_KEY = ["stays"]` to `["stays","active"]` — the raw key appears ~8× within `lib/stays.ts` (useStays queryKey + the onMutate/onError/onSettled optimistic-cache ops of useUpdateStay + useCancelStay + useCreateStay); the hook consumers (`StaysDashboard`, `AddEditStayForm`) use the hooks, not the raw key, so the change is contained to `lib/stays.ts`. Behavior unchanged (`getStays()` still hits the `scope=active` default). Isolates the cache-shape seam before US2 adds the `history` InfiniteData shape. (R11/D13)

**Checkpoint**: Schema + migration green; cache key seam in place. User stories can begin.

---

## Phase 3: User Story 1 — Organize Stays into Folders (Priority: P1) 🎯 MVP

**Goal**: Folder CRUD (per-user unique names), assign/move Stays (form + card, inline-create),
browse the dashboard by folder (incl. Unfiled), folder-delete reassigns to Unfiled (never deletes a
Stay).

**Independent Test**: Create "Europe 2026", assign two Stays, rename to "Summer Europe", delete a
separate empty folder — no Stay data loss; deleting a non-empty folder moves its Stays to Unfiled.

### Tests for User Story 1

- [ ] T009 [P] [US1] Backend folder CRUD test in `apps/backend/test/folder.test.ts`: create/list/rename/delete; per-user name uniqueness **case-insensitive** → `folder.name_taken` on create + rename; `folder.name_required`/`folder.name_too_long`; owner-scoping (other user's folder → `404`). (SC-001/D3/R2)
- [ ] T010 [P] [US1] Backend reassignment + cascade test in `apps/backend/test/folder-cascade.test.ts`: delete a non-empty folder → its Stays survive with `folder_id IS NULL` (SET NULL, SC-004); extend the shipped cascade test (`apps/backend/test/stay-cascade.test.ts` — there is no file literally named "cascade-orphan") to assert zero `folder` rows after `deleteUser`. (R12)
- [ ] T011 [P] [US1] Frontend test `apps/frontend/src/features/stays/AddEditStayForm.test.tsx`: `folderId` seeds from the loaded Stay on **edit**; the folder `<select>` renders real folders; **inline-create** adds + selects a folder; the submitted payload **includes** `folderId` (guards the R10 hardcoded-null regression).
- [ ] T012 [P] [US1] Frontend test `apps/frontend/src/features/folders/Folders.test.tsx`: create/rename/delete-confirm dialogs; browse-by-folder grouping incl. an **Unfiled** group; move-to-folder from the Stay card; non-empty-delete warning.

### Implementation for User Story 1

- [ ] T013 [US1] `apps/backend/src/repositories/folderRepository.ts`: owner-scoped `listFolders` (ordered by `created_at`, with active-Stay `stayCount` aggregate), `createFolder` (**bare `.onConflictDoNothing()` with NO `target:`** — the NOCASE index is raw SQL not in Drizzle's schema, so it can't be named; `.returning()` empty array = name taken), `renameFolder`, `deleteFolder` — all `and(eq(id), eq(userId))`. (R7/R8/R2)
- [ ] T014 [US1] `apps/backend/src/services/folderService.ts`: create/rename mapping the unique-index conflict → `folder.name_taken`; delete is confirm-guarded (`confirm.required`) then a single `DELETE` (FK SET NULL reassigns); ownership → `NotFound`. JSDoc. (R2/R7/D4)
- [ ] T015 [US1] `apps/backend/src/controllers/folderController.ts`: hand-built `FolderDTO` via `FolderDTO.parse()` allowlist before `c.json()`. (D7)
- [ ] T016 [US1] `apps/backend/src/routes/folders.ts`: routes own the **full `/api/folders…` path** (per the `routes/stays.ts` pattern); **replicate the local `requireUserId(c)` helper from `routes/stays.ts`** (better-auth `getSession` — there is no shared session middleware; each route file re-implements it), plain Hono + `safeParse`, keyed errors. Then **mount in `apps/backend/src/index.ts`**: `import { folders }` + `app.route("/", folders)` next to the other `app.route` calls. (R12)
- [ ] T017 [US1] Extend `apps/backend/src/services/stayService.ts` create + update: when `folderId` non-null, `SELECT folder WHERE id=? AND user_id=?` → `NotFound` if absent (no leak); include `folderId` in the update path (so move/assign persists). Cross-user-assign rejected on POST + PATCH. (R7/D6)
- [ ] T018 [US1] `apps/frontend/src/lib/folders.ts`: `["folders"]` query + create/rename/delete mutations; invalidate `["folders"]` + `["stays","active"]` on mutate. (R11/D13)
- [ ] T019 [US1] `apps/frontend/src/features/folders/`: `FolderList` + create/rename dialogs + delete-confirm (non-empty → reassign-to-Unfiled warning). i18n strings, tokens-only, `aria-live`. (FR-001/FR-003/FR-009)
- [ ] T020 [US1] **Fix** `apps/frontend/src/features/stays/AddEditStayForm.tsx` (R10): seed `folderId` from the loaded Stay (edit), make it a controlled real folder `<select>` + inline "create folder", and add `folderId` to the payload memo **and its deps** (currently hardcoded `null`).
- [ ] T021 [US1] Extend `apps/frontend/src/features/stays/StaysDashboard.tsx` (browse-by-folder grouping incl. Unfiled + flat toggle) and `StayCard.tsx` (a "move to folder" action wired to the PATCH mutation).

**Checkpoint**: Folders fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 — History of Past Stays (Priority: P2)

**Goal**: Past Stays leave the active dashboard and appear in a paginated History tagged
attended/cancelled — derived at read time, no job.

**Independent Test**: A user with one past, one cancelled, two upcoming Stays opens History → sees
the past tagged "attended" and the cancelled tagged "cancelled"; neither is on the active dashboard;
advancing the clock past an upcoming departure moves it to History on the next read.

### Tests for User Story 2

- [ ] T022 [P] [US2] Backend scope truth-table test in `apps/backend/test/stay-scope.test.ts` (`vi.setSystemTime`): the 4-row table (active/cancelled × past/upcoming) → correct `scope=active` vs `scope=history` membership + `historyTag`; same-day-departure stays active (D14); coordless Stay history `isPast` pinned to UTC. (SC-002/SC-003/D2/D14/R5)
- [ ] T023 [P] [US2] Backend History pagination test in `apps/backend/test/stay-history-pagination.test.ts`: seed > pageSize past Stays incl. rows the in-service `isPast` refine drops → pages are **complete + non-duplicated** across the boundary, `nextCursor` from last KEPT row, loop-fill fires on underfill, terminal `nextCursor=null`. (SC-005/R5)
- [ ] T024 [P] [US2] Extend `apps/backend/test/stay-dto.test.ts`: `toOwnerResponse` includes `historyTag`; `toPublicStayDTO` omits it. **Update the existing `OwnerStayDTO` test literal** in that file to include the now-required `historyTag` field, or it won't compile. (R6)
- [ ] T025 [P] [US2] Frontend test `apps/frontend/src/features/stays/History.test.tsx`: infinite-scroll fetches the next page on `nextCursor`; year grouping; attended vs cancelled tags; `aria-live` on list growth.

### Implementation for User Story 2

- [ ] T026 [US2] `apps/backend/src/repositories/stayRepository.ts`: add `listStaysForHistory(userId, cursor, limit)` — coarse SQL `WHERE user_id=? AND (status='cancelled' OR departure_date < <today_utc+1d>) AND (departure_date,id) < cursor ORDER BY departure_date DESC, id DESC LIMIT pageSize+buffer` (backed by `stay_user_departure_idx`). (R4/R5)
- [ ] T027 [US2] Extend `apps/backend/src/services/stayService.ts`: `scope=active` → existing `listStays` then **`filter(!isPast)`**; `scope=history` → coarse query + in-service refine (`historyTag != null`) + `nextCursor` from last KEPT row + loop-fill on underfill; compute `historyTag` in `toOwnerDTO` (cancelled→"cancelled" else isPast→"attended" else null); coordless history `isPast` pinned to UTC. (R4/R5/R6/D2)
- [ ] T028 [US2] Extend `apps/backend/src/controllers/stayController.ts` `toOwnerResponse`: add `historyTag` to the allowlist (else silently dropped). (R6)
- [ ] T029 [US2] Extend `apps/backend/src/routes/stays.ts`: parse `scope` (default `active`), `folder` (`<id>|unfiled`), `cursor`, `limit`; return `{ stays }` for active and a **hand-built** `HistoryPage { stays, nextCursor }` for history (it's a TS interface, not Zod — no `.parse()`; build it like `toOwnerResponse`). (contracts/api.md)
- [ ] T030 [US2] Extend `apps/frontend/src/lib/stays.ts`: add `useStaysInfinite("history")` via `useInfiniteQuery` (`getNextPageParam: last => last.nextCursor`, `InfiniteData` shape); cancel mutation moves the row from active cache → history (or invalidates both). (R11/D13)
- [ ] T031 [US2] `apps/frontend/src/features/stays/StayCard.tsx`: **REMOVE** the `isPast` "past" badge (past now lives in History). (DEV-03)
- [ ] T032 [US2] `apps/frontend/src/features/stays/HistoryPage.tsx` (+ history Stay card): infinite-scroll list, year groups, attended/cancelled tags, sort by date/folder, `aria-live`, i18n, tokens-only. (FR-005/FR-009)
- [ ] T033 [US2] Extend `apps/frontend/src/router.tsx`: add the History route and extend `staysRoute.validateSearch` with `scope?`/`folder?`/`sort?`; point the dashboard at `scope=active`. (D1/D10)

**Checkpoint**: Dashboard is active-only; History paginates correctly. US1 + US2 both independent.

---

## Phase 5: User Story 3 — Duplicate & Prune (Priority: P3)

**Goal**: Duplicate a Stay (form pre-filled, cleared dates) and permanently delete a cancelled Stay.

**Independent Test**: Duplicate a past Stay → Add form pre-filled, dates cleared → save a new
upcoming Stay; permanently delete a cancelled Stay from History → it is gone; a non-cancelled Stay
cannot be permanently deleted.

### Tests for User Story 3

- [ ] T034 [P] [US3] Backend permanent-delete test in `apps/backend/test/stay-permanent.test.ts`: cancelled → hard-deleted; non-cancelled (active/attended) → `stay.not_cancelled`; missing `confirm` → `confirm.required`; not-owned → `404`; linked `commitment.stay_id` SET NULL. (SC-006/D8)
- [ ] T035 [P] [US3] Frontend test: duplicate prefill (location/men/needs/contact/notes/folder copied, **dates cleared**) in `AddEditStayForm.test.tsx`; permanent-delete confirm dialog in `History.test.tsx`.

### Implementation for User Story 3

- [ ] T036 [US3] `apps/backend/src/services/stayService.ts` + `routes/stays.ts`: `permanentDelete` — hard `DELETE` iff `status='cancelled'` (`stay.not_cancelled` else), confirm-guarded; `DELETE /api/stays/:id/permanent`. Structured log `stay.permanently_deleted`. (D8)
- [ ] T037 [US3] Extend `apps/frontend/src/router.tsx` `staysNewRoute.validateSearch` with `?from=<stayId>`; `AddStayPage` prefills from `getStay(from)` with cleared dates incl. `folderId` (distinct from the edit `seeded` path). (D9/R9)
- [ ] T038 [US3] `apps/frontend/src/features/stays/HistoryPage.tsx`: a "delete permanently" action (cancelled only) + confirm dialog; `lib/stays.ts` `permanentDelete` mutation invalidating `["stays","history"]`; a "duplicate" action on the Stay card linking to `/stays/new?from=`. (D8/D9)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T039 [P] i18n he+en parity in `apps/frontend/src/i18n/`: `folders.{title,create,rename,delete,deleteWarn,nameTaken,unfiled}`, `history.{title,attended,cancelled,empty,loadMore}`, + the 004 error messages; ensure the existing he/en parity test passes. (FR-009/R12)
- [ ] T040 [P] Structured logs (Workers Observability, no Winston) via the existing `createLogger` / `c.get("log")` pattern (as `index.ts` + the me/stays services already do): `folder.created`, `folder.deleted`, `stay.permanently_deleted`. (R12)
- [ ] T041 [P] e2e `apps/frontend/e2e/`: Playwright + axe-core for folder management + History — WCAG 2.1 AA, RTL, keyboard, ≥44px targets, `aria-live` (SC-007/FR-009).
- [ ] T042 Run `specs/004-folders-history/quickstart.md` scenarios 1–4 against `pnpm dev`; fix any drift. Update `CLAUDE.md` (mark 004 complete) only at merge time.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001–T003 parallel; T004 after. No other deps.
- **Phase 2 (Foundational)**: T005 → T006 → T007 (migration before its test); T008 [P] independent. BLOCKS all stories.
- **US1 (Phase 3)**: after Phase 2. Tests T009–T012 [P]; backend T013→T014→T015→T016, T017 [P after T013]; frontend T018→T019, T020 [P], T021 (after T018).
- **US2 (Phase 4)**: after Phase 2 (independent of US1; T030 builds on the T008 seam). Tests T022–T025 [P]; backend T026→T027→T028→T029; frontend T030→{T031,T032,T033}.
- **US3 (Phase 5)**: after Phase 2; T037/T038 reuse the US1 form/folder seam (R10 fix, T020) and the US2 History page (T032) — sequence US3 after US1+US2 in a single-developer flow.
- **Polish (Phase 6)**: after the stories it covers. T039–T041 [P]; T042 last.

### Within each story

Tests written first/with impl → repository → service → controller → route → frontend lib → UI.

### Parallel opportunities

- Setup: T001, T002, T003 together.
- Foundational: T008 alongside T005–T007.
- Each story's test tasks ([P]) together; cross-story parallelism possible after Phase 2 if staffed (US1 backend ∥ US2 backend touch different repo/service methods — coordinate on `stayService.ts`).

---

## Implementation Strategy

**MVP** = Phase 1 + Phase 2 + **US1** (folders, assign/move, browse, reassign-on-delete) — shippable
and independently testable. Then layer **US2** (History + active-only dashboard), then **US3**
(duplicate + permanent-delete). Validate each story at its checkpoint before proceeding; commit per
task or logical group; keep the gate green (typecheck + lint + per-file backend tests, since the full
vitest suite hits the workerd isolate limit under `wrangler dev` — run files individually / rely on CI).
