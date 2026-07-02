---
description: "Task list for Per-Stay Zmanim (Feature 005)"
---

# Tasks: Per-Stay Zmanim

**Input**: Design documents from `specs/005-stay-zmanim/` (plan.md, spec.md, research.md R1–R12,
data-model.md, contracts/api.md, quickstart.md).

**Prerequisites**: 001–004 shipped to `develop`. Branch `005-stay-zmanim` (off `develop`).

**Tests**: REQUESTED — SC-001…SC-008 + quickstart mandate backend (vitest-pool-workers), frontend
(Vitest + Testing Library), and e2e (Playwright + axe). Test tasks are included.

**Organization**: by user story (US1 Stay zmanim P1 → US2 Minyan zmanim P2 → US3 preference P3).
`[P]` = parallelizable (different files, no incomplete dep).

---

## Phase 1: Setup — Shared Contracts (`packages/shared`)

- [ ] T001 [P] Create `packages/shared/src/schemas/zmanim.ts`: `ShabbatZmanim { shabbatDate, candleLighting: string|null, havdalahGeonim: string|null, havdalahRabbeinuTam: string|null, note: "uncomputable"|"havdalah_yom_tov"|null }` and `ZmanimResponse { coversShabbat, hasCoordinates, candleLightingOffsetMinutes, shabbatot: ShabbatZmanim[] }` — TS interfaces (hand-built, no Zod). JSDoc. (data-model)
- [ ] T002 [P] Extend `packages/shared/src/schemas/common.ts`: add `havdalahOpinionSchema = z.enum(["geonim","rabbeinu_tam","both"])` beside `languageSchema`; export the `HavdalahOpinion` type. (R5 #1)
- [ ] T003 Extend `packages/shared/src/schemas/profile.ts`: add `havdalahOpinion` to `updateProfileSchema` (`.optional()`) **and** to the `Profile` interface (the shipped type is `Profile`, not `ProfileDTO`). (R5 #2) (depends on T002)
- [ ] T004 Export the new zmanim schema from `packages/shared/src/schemas/index.ts`; run `pnpm --filter shared typecheck`. (depends on T001–T003)

---

## Phase 2: Foundational — compute lib, profile field round-trip, migration, ADR

**Purpose**: the zmanim compute primitive + the profile-preference plumbing both stories build on.

**⚠️ CRITICAL**: complete + green before user-story work.

- [ ] T005 Create `apps/backend/src/lib/zmanim.ts`: `computeShabbatZmanim(lat, lng, saturdayCivil: string): ShabbatZmanim` — `tzFromCoords` → `new GeoLocation("",lat,lng,0,tz)` → `new ComplexZmanimCalendar(geo)`; `setCandleLightingOffset(isJerusalem(lat,lng)?40:18)` (Jerusalem box ≈31.78N/35.21E ±0.15°, commented heuristic, R3); set the calendar date — prefer `setDate(saturdayCivil)` (ISO string → luxon `fromISO`, avoids any JS-Date runtime-TZ ambiguity) — candle-lighting on **Friday** (`setDate(sat−1d)`) via `getCandleLighting()`; Havdalah on **Saturday** via `getTzaisGeonim8Point5Degrees()` + `getTzais72()`; **format on the returned `DateTime`: `dt.setZone(tz).toFormat("HH:mm")`** — the getters return a **UTC-zoned** luxon `DateTime`, so `dt.toFormat(...)` alone emits UTC (silent wrong time); operate on the instance the getter returns, **no luxon import needed** (R2/ARC). Any getter `null` → field null + `note:"uncomputable"`; Yom-Tov guard `new JewishCalendar(sat+1d).isYomTov()` → null Havdalah + `note:"havdalah_yom_tov"`. (R2/R3/R8/R9)
- [ ] T006 [P] `apps/backend/src/lib/zmanim.test.ts`: fixed coords+Saturday known-value within ±1 min — Jerusalem (assert 40-min offset), Kraków, NYC, London (SC-001); Tromsø June → null + `note:"uncomputable"` (SC-005); a Yom-Tov-adjacent Saturday → Havdalah null + `note:"havdalah_yom_tov"`, candle-lighting present (D2). Pure unit test (no Worker bindings; mirror `calendar.test.ts`). (R11)
- [ ] T007 Add `havdalahOpinion` column to `apps/backend/src/db/schema.ts` `user` (`text("havdalah_opinion").notNull().default("geonim")`); register it in `apps/backend/src/auth.ts` better-auth `user.additionalFields` (`{type:"string",required:false,defaultValue:"geonim",input:true}`, mirror language/theme). (R5 #3,#4)
- [ ] T008 Generate the migration (`pnpm db:generate`) into `apps/backend/migrations/` (next is **`0005_*.sql`**); **VERIFY it is a single `ALTER TABLE user ADD COLUMN havdalah_opinion text NOT NULL DEFAULT 'geonim'`** and NOT a PRAGMA-wrapped table rebuild (hand-author the one-line ALTER if drizzle-kit emits a rebuild — `user` has FK children, D1 rejects the PRAGMA, per 004). Apply `pnpm db:migrate:local`. (R5/ARC) (depends on T007)
- [ ] T009 Widen `apps/backend/src/repositories/userRepository.ts` `updateUser` field type to include `havdalahOpinion`; add `havdalahOpinion` to the `getProfile` explicit field map in `apps/backend/src/services/profileService.ts` (it does not spread). (R5 #5,#6) (depends on T007)
- [ ] T010 [P] `apps/backend/test/profile-havdalah.test.ts`: `GET /api/me` returns `havdalahOpinion:"geonim"` by default; `PATCH /api/me {havdalahOpinion:"rabbeinu_tam"}` round-trips; an invalid value → `400`. (SC-007)
- [ ] T011 [P] Write ADR `docs/adr/0007-zmanim-server-side.md`: `kosher-zmanim` (LGPL) computed server-side; only formatted `HH:mm` strings + opinion labels cross to the FE; confirmed zero FE imports; folds under the existing "legal sign-off pending" gate. (R12) — confirm `0006` is the latest ADR first.

**Checkpoint**: compute lib green + preference round-trips + migration applied.

---

## Phase 3: User Story 1 — Shabbat Zmanim for a Stay (Priority: P1) 🎯 MVP

**Goal**: A Stay with coordinates shows each in-range Shabbat's candle-lighting + Havdalah, in an
expandable card section; coordless → add-location CTA; uncomputable → note.

**Independent Test**: A Kraków Stay (Fri–Sun) expands to show that Shabbat's candle-lighting +
Havdalah in Kraków time; a coordless Stay shows the add-location CTA.

### Tests for User Story 1

- [ ] T012 [P] [US1] `apps/backend/test/stay-zmanim.test.ts`: `GET /api/stays/:id/zmanim` — owner gets entries for a coord-bearing Shabbat Stay; non-owner → `404`; coordless Stay → `hasCoordinates:false` + empty; no-Shabbat Stay → `coversShabbat:false`; a past/cancelled Stay → empty (active-only, D9); `cache-control: private`. (SC-002/003/004, contracts)
- [ ] T013 [P] [US1] `apps/frontend/src/features/stays/ZmanimSection.test.tsx`: renders per-Shabbat list with candle-lighting + Havdalah; coordless → add-location CTA; `note:"uncomputable"` → "cannot compute" message; **`note:"havdalah_yom_tov"` → the Yom-Tov note renders with candle-lighting still shown** (FR-007); Havdalah follows the opinion prop (geonim/rabbeinu_tam/both).

### Implementation for User Story 1

- [ ] T014 [US1] `apps/backend/src/services/zmanimService.ts` — `stayZmanim(db, userId, stayId, clientTz?)`: `getStayById(db, userId, stayId)` (db-first arg order; `null` → caller 404); **`row.status === "cancelled"` → empty** (separate from past); coordless (`lat==null||lng==null`) → `{coversShabbat: coversShabbat(arr,dep,"UTC"), hasCoordinates:false, shabbatot:[]}`; **re-derive isPast with EXPORTED helpers** (`resolveTz` is private — build `const tz = (lat!=null&&lng!=null) ? tzFromCoords(lat,lng) : (clientTz ?? "UTC")`; `civilDate(dep,"UTC") < todayCivil(tz)`) → past → empty; else `shabbatSaturdaysInRange(arr,dep,arr,dep)` (string[]) → map `computeShabbatZmanim`. (R6/R7, data-model)
- [ ] T015 [US1] `apps/backend/src/controllers/zmanimController.ts` — `stayZmanimController` → hand-build `ZmanimResponse`; `apps/backend/src/routes/zmanim.ts` — `GET /api/stays/:id/zmanim`: **import `requireUserId` from `lib/auth.ts`** (canonical; don't re-copy the stays.ts inline session code) + a local `clientTz(c)` reading `X-Client-Timezone` (mirror stays.ts) passed through controller→service; **`c.header("cache-control", "private, max-age=3600")`** before `c.json` (mirror `routes/calendar.ts`); mount `app.route("/", zmanim)` in `index.ts`. (R6/R12)
- [ ] T016 [US1] `apps/frontend/src/lib/zmanim.ts` — `useStayZmanim(id, enabled)` query (detail-scoped, `enabled` on expand). (R6)
- [ ] T017 [US1] `apps/frontend/src/features/stays/ZmanimSection.tsx` — per-Shabbat list, opinion-aware Havdalah (reads the profile `havdalahOpinion`), `note` states (uncomputable / Yom-Tov), coordless add-location CTA (link to `/stays/$id/edit`), `aria-live`, i18n, tokens-only.
- [ ] T018 [US1] Extend `apps/frontend/src/features/stays/StayCard.tsx`: an expandable "Shabbat times" section gated by `stay.coversShabbat`, lazy-fetching via `useStayZmanim(stay.id, expanded)`. (R6)

**Checkpoint**: Stay zmanim fully functional (MVP).

---

## Phase 4: User Story 2 — Shabbat Zmanim for a Minyan (Priority: P2)

**Goal**: A public Shabbat Minyan shows its local candle-lighting + Havdalah, identical for all
viewers; weekday Minyanim show none.

**Independent Test**: A signed-out viewer opening a Shabbat Minyan in Vienna sees Vienna's times.

### Tests for User Story 2

- [ ] T019 [P] [US2] `apps/backend/test/minyan-zmanim.test.ts`: `GET /api/events/:id/zmanim` — **public** (no cookie) returns one entry for a Shabbat-dated event; weekday event → `coversShabbat:false`; cancelled/past → empty; `cache-control: public`. (SC-004, R10)
- [ ] T020 [P] [US2] `apps/frontend/src/features/events/MinyanZmanim.test.tsx` (or extend MinyanDetail test): a Shabbat minyan (FE gate `new Date(eventDate).getUTCDay()===6`, since `PublicMinyanDTO` has no `coversShabbat`) renders the zmanim section; a weekday minyan renders none.

### Implementation for User Story 2

- [ ] T021 [US2] Extend `apps/backend/src/services/zmanimService.ts` — `minyanZmanim(db, eventId)`: `getMinyanById` (EXACT coords, not the fuzzed DTO); gate on `isSaturday(eventDate)` + not cancelled/past; emit a **single** `ShabbatZmanim` from `eventDate` (no range enumeration). (R10, data-model)
- [ ] T022 [US2] Extend `apps/backend/src/controllers/zmanimController.ts` (`minyanZmanimController`) + add `GET /api/events/:id/zmanim` to `apps/backend/src/routes/events.ts` (PUBLIC — reuse the `optionalUserId` from `lib/auth.ts` already used there; **`c.header("cache-control", "public, max-age=3600")`**). NO `/api/minyan` namespace. (R10)
- [ ] T023 [US2] `apps/frontend/src/lib/zmanim.ts` (extend) — `useMinyanZmanim(id)`; in `apps/frontend/src/features/events/MinyanDetail.tsx` render `ZmanimSection` for Shabbat-dated minyanim — gate via `new Date(m.eventDate).getUTCDay()===6` + not cancelled/completed (no `coversShabbat` on the minyan DTO), or always call and render nothing when `coversShabbat:false` returns. (R10)

**Checkpoint**: Minyan zmanim public + active-only. US1 + US2 independent.

---

## Phase 5: User Story 3 — Personal Havdalah Preference (Priority: P3)

**Goal**: A user chooses which Havdalah opinion they see (geonim/rabbeinu_tam/both); default geonim.

**Independent Test**: Setting the preference to Rabbeinu Tam changes the displayed Havdalah; "both"
shows both labeled. (Backend round-trip already covered by T010.)

### Tests for User Story 3

- [ ] T024 [P] [US3] **Create** `apps/frontend/src/features/profile/Profile.test.tsx` (no unit test exists today — only e2e/profile.spec.ts): the Havdalah preference control renders the current value, and changing it calls the update mutation with `havdalahOpinion`.

### Implementation for User Story 3

- [ ] T025 [US3] Extend `apps/frontend/src/lib/profile.ts`: thread `havdalahOpinion` through get/update.
- [ ] T026 [US3] Extend `apps/frontend/src/features/profile/Profile.tsx`: a `havdalahOpinion` control (geonim / rabbeinu_tam / both), mirroring the language/theme controls; i18n, tokens, ≥44px, keyboard.
- [ ] T027 [US3] Ensure `ZmanimSection` (T017) reads the profile preference (default `geonim`) to pick the displayed Havdalah; `both` shows both labeled. (closes the loop with US1/US2 rendering)

**Checkpoint**: preference honored wherever zmanim render.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T028 [P] i18n he+en parity in `apps/frontend/src/i18n/locales/{he,en}.ts`: `zmanim.{title,shabbatOf,candleLighting,havdalah,havdalahGeonim,havdalahRabbeinuTam,cannotCompute,yomTovNote,addLocation,addLocationCta}` + `profile.havdalah.{label,geonim,rabbeinuTam,both}`; the existing parity test must pass. (R12/FR-010)
- [ ] T029 [P] e2e `apps/frontend/e2e/zmanim.spec.ts` (Playwright + axe): expand a Stay's zmanim section → WCAG 2.1 AA + RTL + keyboard; the profile preference control axe-clean (SC-008). (The Playwright webServer runs `vite dev` — no `dist/`, so the bundle check does NOT belong here.)
- [ ] T029b [P] SC-006 bundle guard (separate from e2e): a static check that `kosher-zmanim`/`GeoLocation`/`ComplexZmanimCalendar` is **not imported anywhere in `apps/frontend/src`** (grep), and a built-bundle check (`pnpm --filter @minyanim/frontend build` → grep `apps/frontend/dist/**/*.js`). `kosher-zmanim` is not in `apps/frontend/package.json` today — keep it that way. (SC-006)
- [ ] T030 Run `specs/005-stay-zmanim/quickstart.md` scenarios 1–5 against `pnpm dev`; fix drift. Update `CLAUDE.md` (005 active→complete) at merge time only.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001/T002 [P]; T003 after T002; T004 after T001–T003.
- **Phase 2 (Foundational)**: T005→T006; T007→T008, T007→T009, T010 after T009; T011 [P]. BLOCKS stories.
- **US1 (P3)**: after Phase 2. Tests T012/T013 [P]; T014→T015→T016→T017→T018.
- **US2 (P4)**: after Phase 2 (independent of US1; reuses `zmanimService` + `ZmanimSection`). Tests T019/T020 [P]; T021→T022→T023.
- **US3 (P5)**: backend round-trip is in Phase 2 (T007–T010); FE T024→T025→T026; T027 ties the preference into the US1/US2 rendering (so sequence after US1's ZmanimSection exists).
- **Polish (Phase 6)**: after the stories it covers; T028/T029 [P]; T030 last.

### Within each story

Tests written first/with impl → lib → service → controller → route → frontend lib → UI.

### Parallel opportunities

- Setup: T001, T002 together.
- Foundational: T006 (lib test) ∥ T011 (ADR) alongside the profile-plumbing chain.
- Each story's test tasks ([P]) together. US1 and US2 backend touch the same `zmanimService.ts` file
  (coordinate: US1 adds `stayZmanim`, US2 adds `minyanZmanim` — different functions, same file).

---

## Implementation Strategy

**MVP** = Phase 1 + Phase 2 + **US1** (Stay zmanim, expandable card, coordless CTA, uncomputable
note) — shippable and independently testable. Then **US2** (Minyan zmanim, public), then **US3** (the
preference control; its backend round-trip already lands in Phase 2 so US1/US2 honor the default from
day one). Validate each story at its checkpoint; keep the gate green (typecheck + lint + per-file
backend tests — the full vitest suite hits the workerd isolate limit under `wrangler dev`; CI clean).
Remember: **`kosher-zmanim` never crosses to the FE** (SC-006) — only formatted strings.
