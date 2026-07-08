---
description: "Task list for Seed Import + Seed-User Claim / Merge (Feature 009)"
---

# Tasks: Seed Import + Seed-User Claim / Merge

**Input**: Design documents from `specs/009-seed-import-claim/` (plan.md, spec.md D1–D9,
data-model.md, contracts/api.md, quickstart.md).

**Prerequisites**: 001–008 shipped. Branch `009-seed-import-claim`.

**Status**: **Part A + import Step 1 are COMPLETE ([x])**. Import **Steps 2–4 are PENDING ([ ])** —
deliberately blocked on the row-semantics decision (D8); their tasks are listed unchecked.

**Tests**: SC-001…SC-008 mandate backend (vitest-pool-workers), frontend (Vitest + Testing Library),
and tool (`node:test`) tests. `[P]` = parallelizable (different files).

---

## Phase 1: Setup — Shared Contracts (`packages/shared`)  ✅

- [x] T001 [P] Create `packages/shared/src/schemas/claim.ts`: `ClaimableSeedDTO { seedUserId, name, phone, stays, events }` (interface) + `claimSeedSchema = z.object({ seedUserIds: z.array(z.string().min(1)).min(1, "claim.none_selected") })` → `ClaimSeedInput`. JSDoc. (contracts)
- [x] T002 Export `claim` schema from `packages/shared/src/schemas/index.ts`; `pnpm --filter shared typecheck`. (depends on T001)

---

## Phase 2: Foundational — the `user.kind` model + migration  ✅

**Purpose**: the seed-user primitive both the claim and the discovery-hiding build on.

- [x] T003 Add `kind` to `apps/backend/src/db/schema.ts` `user` (`text("kind").notNull().default("real")`), with a comment explaining seed = no-account placeholder. NOT registered in better-auth `additionalFields` (set by importer/DB only, never a client profile update). (D1)
- [x] T004 Generate + verify the migration `apps/backend/migrations/0009_abnormal_goblin_queen.sql` is a single `ALTER TABLE user ADD kind text DEFAULT 'real' NOT NULL` (not a PRAGMA rebuild). Apply `pnpm db:migrate:local`. (D1) (depends on T003)

**Checkpoint**: seed rows can exist (kind='seed', no account) and own stays/events.

---

## Phase 3: User Story 2 — Claim / merge (Priority: P1)  ✅ 🎯 MVP

**Goal**: A real user claims phone-matched seeds; their trips/minyanim merge in; the seed is deleted.

**Independent Test**: A seed with a matching phone + a stay is offered, confirmed, merged, deleted.

### Tests for User Story 2

- [x] T005 [P] [US2] `apps/backend/test/claim.test.ts`: offer + merge + seed-deletion (`claimed:1, stays:1`); a non-matching seed is not offered and a **forged POST** for its id → `claimed:0` (server re-verifies, D3/SC-004); a caller with no phone → empty offers (SC-002).

### Implementation for User Story 2

- [x] T006 [US2] `apps/backend/src/repositories/claimRepository.ts` — `findClaimableSeeds(db, userId)`: caller phones → join `user(kind='seed')` ⨝ `phone_number`, de-dupe one entry per seed, attach stay/event counts. `claimSeeds(db, realUserId, seedUserIds)`: **re-verify** kind+phone → verified subset; drop the verified seeds' commitments to events the caller already holds (unique-index conflict, D5); reassign `commitment`/`eventRole`/`stay`/`event` → caller; `DELETE` the seed rows (cascade phones); return `{ claimed, stays, events }`. (D2/D3/D5)
- [x] T007 [US2] `apps/backend/src/services/claimService.ts` — `getClaimableSeeds` → `ClaimableSeedDTO[]`; `claimSeedUsers` → `ClaimResult` (thin delegation to the repository). (contracts)
- [x] T008 [US2] Extend `apps/backend/src/routes/me.ts`: `GET /api/me/claims` (requireUserId → `{ seeds }`) and `POST /api/me/claims` (requireUserId + `claimSeedSchema.safeParse` → 400 on invalid, else merge → `ClaimResult`). (contracts)
- [x] T009 [US2] `apps/frontend/src/lib/claims.ts` — `useClaimableSeeds()` (`GET /me/claims`) + `useClaimSeeds()` (`POST /me/claims`, invalidate `CLAIMS_KEY` + `STAYS_KEY`). (contracts)
- [x] T010 [US2] `apps/frontend/src/features/stays/ClaimBanner.tsx` — dismissible dashboard prompt; sums stay/event counts; confirm → `mutate(all seedUserIds)`; wire into `StaysDashboard.tsx`. i18n `claim.*`, tokens-only, WCAG AA. (FR-008/FR-009)
- [x] T011 [P] [US2] `apps/frontend/src/features/stays/ClaimBanner.test.tsx`: renders on match, merges all matched seeds on confirm, hides on dismiss.

**Checkpoint**: claim/merge fully functional (MVP).

---

## Phase 4: User Story 3 — Seed privacy in discovery (Priority: P1)  ✅

**Goal**: A seed owner's phone is withheld in the discovery travelers list (name still shows) until
claimed — revising ADR-0008 for seeds.

### Implementation for User Story 3

- [x] T012 [US3] Extend `apps/backend/src/repositories/discoveryRepository.ts`: add `ownerKind: user.kind` to the potential-stay projection + normalize it. (D4)
- [x] T013 [US3] Extend `apps/backend/src/services/discoveryService.ts`: in `travelerContact`, a `kind='seed'` owner exposes **no phone** (`ownerKind === "seed" ? null : …`), name still shown. (D4/FR-007)

**Checkpoint**: seed phones hidden in discovery; real-user behavior (ADR-0008) unchanged.

---

## Phase 5: User Story 1 — Import pipeline (Priority: P1) — Part B

**Goal**: A staged, dev-only, local CSV→DB pipeline; each step writes a reviewable artifact.

### Step 1 — inspect / convert  ✅

- [x] T014 [US1] `tools/seed-import/src/csv.ts` — RFC-4180-ish parser (quotes, escaped `""`, embedded commas/newlines, CRLF, BOM) + `parseCsvToObjects` (header-keyed rows, de-duped headers). (D7)
- [x] T015 [US1] `tools/seed-import/src/profile.ts` — `classifyColumn` (header hints he+en + value fractions; email/date before phone) + `profileSheet` (per-column fill rate, distinct, samples, guessed kind). (D8)
- [x] T016 [US1] `tools/seed-import/src/inspect.ts` — CLI: CSV → `raw.json` + `profile.json`, print summary; only `main()` when run directly. (D7)
- [x] T017 [P] [US1] `tools/seed-import/src/profile.test.ts` (`node:test`) — parser (quotes/escapes/newlines/CRLF/BOM) + `classifyColumn`.
- [x] T018 [US1] `tools/seed-import/README.md` — the staged pipeline diagram + status checklist.

### Step 2 — map + Zod schema validation  ⏳ PENDING (blocked on D8: what is a row?)

- [ ] T019 [US1] **DECISION FIRST** (D8): review a real `profile.json` and decide what one sheet row represents (one person+one trip / one person+many trips / includes a hosted minyan). Record the decision in the README + this spec before coding Step 2.
- [ ] T020 [US1] `tools/seed-import/src/map.ts` — a seed Zod contract + column→field mapping (driven by T019); validate each `raw.json` row, writing valid records to `records.json` and per-row errors aside. (FR-013)

### Step 3 — data-quality gates  ⏳ PENDING

- [ ] T021 [US1] `tools/seed-import/src/gate.ts` — normalize + validate the phone to E.164 (the claim match key; a bad phone → the person can never claim, D9); resolve the location via the app's `geoService`; write passing rows to `accepted.json`, failing rows to `rejected.json` with a reason. (FR-014)

### Step 4 — create seeds  ⏳ PENDING

- [ ] T022 [US1] `tools/seed-import/src/create.ts` — create `kind='seed'` user rows (synthetic `@seed.local` email, no account) + their stays (and events, if the row-semantics decision includes hosted minyanim) in **dev D1**, from `accepted.json`. Support `--dry-run` (report what would be created, write nothing). (FR-015)
- [ ] T023 [P] [US1] Tests for Steps 2–4 (`node:test`): mapping validation quarantines bad rows; the phone/location gates accept/reject correctly; `--dry-run` writes nothing.

---

## Phase 6: Polish & Cross-Cutting

- [x] T024 [P] i18n he+en parity: `claim.{title,body,confirm,dismiss}` in `apps/frontend/src/i18n/locales/{he,en}.ts`; parity test passes. (FR-009)
- [ ] T025 e2e (Playwright + axe): the claim banner on the dashboard meets WCAG 2.1 AA, RTL, keyboard (SC-008) — needs a matched-seed fixture. (pending fixture)

---

## Dependencies & Execution Order

- **Phase 1–2** (contracts + `kind` model + migration) BLOCK everything. ✅
- **US2** (claim) after Phase 2: T005 [P]; T006→T007→T008→T009→T010; T011 [P]. ✅
- **US3** (discovery hiding) after Phase 2, independent of US2: T012→T013. ✅
- **US1** (import) is independent of A: Step 1 (T014–T018) ✅; Steps 2–4 (T019–T023) **pending on the
  D8 row-semantics decision** (T019 gates T020–T023).
- **Polish**: T024 ✅; T025 pending a fixture.

---

## Implementation Strategy

**Shipped MVP** = Phase 1 + 2 + **US2** (claim/merge) + **US3** (discovery hiding) + **Step 1** of the
import — all complete, tested, and merged. **Remaining** = import **Steps 2–4**, which are
intentionally deferred until the operator reviews a real `profile.json` and decides what one
spreadsheet row represents (D8). That decision drives the seed schema, the quality gates, and the
create step; until then the pipeline safely stops after producing the reviewable Step-1 artifacts.

**Security reminder** (D3): the claim match key is a user-typed phone, so the server MUST re-verify on
write (T006) and discovery MUST hide seed phones (T013). SMS-OTP-verified claims are the launch-gate
follow-up.
