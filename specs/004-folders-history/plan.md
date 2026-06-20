# Implementation Plan: Folders & History

**Branch**: `004-folders-history` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-folders-history/spec.md` (Clarified — D1–D14).

## Summary

Organize Stays into user-owned **folders** and move **past** Stays off the active dashboard into a
paginated **History** view (tagged attended/cancelled). Adds folder CRUD, a Stay↔Folder FK (the
"Unfiled = `folder_id IS NULL`" + `ON DELETE SET NULL` model), a `scope=active|history` filter on
the existing stays endpoint, and the two 002-deferred actions (duplicate Stay, permanent-delete a
cancelled Stay). History/attended is **derived at read time** (no cron), mirroring 002's `isPast`.

Technical spine: a new `folder` table + a **SQLite table-rebuild** migration adding `stay.folder_id`
FK (pre-launch drop/recreate, no data); folder CRUD (`/api/folders`) + a scoped/paginated
`GET /api/stays`; client-side folder grouping; the duplicate flow reuses the 002 Add-Stay form
(client-side prefill, fresh `POST`).

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 — unchanged from 001–003.

**Primary Dependencies**: Hono (plain routes + manual Zod `safeParse`, DTOs via `*.parse()` — D13
of 002), Drizzle ORM + drizzle-kit, Zod v4, better-auth, TanStack Router + Query, react-i18next,
Tailwind v4. **No new runtime deps.** Reuses 002's `stayService`/`stayRepository`/`toOwnerDTO` +
the `isPast` derivation (`apps/backend/src/lib/timezone.ts`).

**Storage**: Cloudflare D1 (SQLite) via Drizzle. New `folder` table; **`stay` table rebuilt** to add
the `folder_id` FK (`ON DELETE SET NULL`) + new indexes. One migration (folder created before the
rebuild). **Pre-launch: no real data — drop/recreate acceptable (D5).**

**Testing**: vitest-pool-workers (folder CRUD + uniqueness + ownership; scope=active/history
derivation with `vi.setSystemTime`; folder-delete → SET NULL reassignment; permanent-delete guard;
**cascade-orphan** extended to `folder`; History cursor pagination correctness). Vitest + Testing
Library (folder dialogs, browse-by-folder, History infinite-scroll, duplicate prefill). Playwright +
axe-core (folder mgmt + History WCAG 2.1 AA, SC-007).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo.

**Performance Goals**: folder/dashboard reads p95 < 200 ms (indexed); History pages via a
`(user_id, departure_date)` index; SC-002 derived (instant on read).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (FR-009/SC-007); i18n-only strings; tokens-only
colors; **D1 has no interactive transactions** — folder delete relies on the `ON DELETE SET NULL`
cascade (single `DELETE`, no app-side reassignment loop); ownership-scoped writes (assign to a
non-owned folder rejected).

**Scale/Scope**: per-user tens of folders, up to years of past Stays (History paginated). 3 user
stories; ~8 endpoints (folder CRUD + scoped stays + permanent-delete; duplicate is client-side);
1 new table + 1 `stay` rebuild; new frontend folder UI + History view + small extensions to the 002
dashboard/form.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ | New `folderService`/`folderRepository`; stays scope/history extends `stayService`. |
| Contract-first (shared Zod → DTOs + FE validation) | ✅ | `FolderDTO`, `FolderInput`, `StayScope`, error codes in `packages/shared`. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | FR-009/SC-007: folder dialogs + History axe-verified; `aria-live` on list changes. |
| i18n-only strings, tokens-only colors | ✅ | New he/en keys; no hardcoded colors. |
| Secrets via env bindings only | ✅ | No new secrets. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse 001 logger; DB cascade over app-side reassignment. |
| No interactive D1 txns; verified cascade | ✅ | Folder delete = `ON DELETE SET NULL`; cascade-orphan test extended to `folder`. |

**Result**: PASS — no deviations. The one notable change is **amending shipped 002** (dashboard →
active-only; `GET /api/stays` scope filter) — a deliberate, user-approved decision (D1), not added
complexity. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/004-folders-history/
├── plan.md            # This file
├── research.md        # Phase 0 — decisions (D1–D14 + technical resolutions)
├── data-model.md      # Phase 1 — folder table, stay FK rebuild, derivations, indexes
├── quickstart.md      # Phase 1 — end-to-end validation scenarios
├── contracts/
│   └── api.md         # Phase 1 — folder CRUD + scoped/paginated stays + permanent-delete
└── tasks.md           # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/folder.ts          # FolderDTO, CreateFolderInput/UpdateFolderInput (name 1..60), StayScope enum
├── schemas/stay.ts (extend)   # StayScope ('active'|'history'); historyTag on the owner DTO (derived)
└── errors.ts (extend)         # folder.name_taken, stay.not_cancelled

apps/backend/src/
├── db/schema.ts               # + folder table (+ NOCASE unique index, R2); stay folder_id FK (set null) + 2 indexes
├── migrations/0004_*.sql      # drop/recreate stay+commitment in dep order, folder first; strip PRAGMA; verify commitment FK (R3)
├── routes/folders.ts          # GET/POST/PATCH/DELETE /api/folders  (+ mount in index.ts — R12)
├── routes/stays.ts (extend)   # GET /api/stays?scope=&folder=&cursor= ; DELETE /api/stays/:id/permanent
├── controllers/{folderController.ts, stayController.ts(extend: historyTag in toOwnerResponse — R6)}
├── services/folderService.ts  # CRUD; map NOCASE-unique violation → folder.name_taken; ownership (R7)
├── services/stayService.ts (extend) # scope IN-SERVICE filter (!isPast), historyTag in toOwnerDTO, history keyset+refine, permanent-delete (cancelled-only), folder-ownership check on create/update
└── repositories/{folderRepository, stayRepository(extend: listStaysForHistory — R4)}.ts

apps/frontend/src/
├── features/folders/          # folder list/create/rename/delete-confirm + browse-by-folder grouping
├── features/stays/StaysDashboard.tsx (extend) # active-only + folder grouping + move-to-folder
├── features/stays/StayCard.tsx (extend)        # REMOVE the isPast "past" badge (past now lives in History — DEV-03)
├── features/stays/History*.tsx (new)           # History infinite-scroll, year groups, attended/cancelled tags, permanent-delete
├── features/stays/AddEditStayForm.tsx (FIX)    # folderId is hardcoded null today (R10): seed on edit+duplicate, real folder <select>+inline-create, add to payload memo+deps
├── router.tsx (extend)        # staysRoute.validateSearch +scope/folder/sort; staysNewRoute +?from=; History route
└── lib/{folders.ts (new, ["folders"]), stays.ts (refactor: ["stays",scope] array + useStaysInfinite("history") InfiniteData — R11)}
```

**Structure Decision**: Web two-app monorepo (unchanged). New `folder` route/service/repository +
frontend `folders` feature; `stays` backend + frontend extended for scope/History/move/duplicate.
All contracts in `packages/shared`.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
