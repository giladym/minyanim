# Feature Specification: Folders & History

**Feature Branch**: `004-folders-history`

**Created**: 2026-06-18

**Status**: Clarified (2026-06-21)

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays** (and ships after 003).

---

## Summary

Lets heavy users organize their Stays into self-named **folders** (by country, trip, year) and
review past Stays in a **History** view tagged "attended". Past Stays move **off** the active
dashboard into History so the dashboard stays focused on what's upcoming. Also pulls in two items
002 deferred here: a **"duplicate stay"** quick action and **permanent deletion** of a cancelled
Stay.

---

## Clarifications

### Session 2026-06-21

Reconciled from a two-role spec review (expert PM + expert Architect) against the ROADMAP, the
constitution, and the shipped 002/003 code. Decisions (D#) are referenced from the requirements.

- **D1 — Dashboard vs History (amends shipped 002).** The active dashboard shows **only
  upcoming/in-progress** Stays. **Past** Stays move into a **History** view and are removed from the
  active dashboard. This **supersedes 002 FR-005/FR-011's** "show past Stays on the dashboard,
  visually distinguished" — 002's dashboard is updated to active-only. The API gains a scope filter:
  `GET /api/stays?scope=active|history` (default `active`); 002's `listStays` and the dashboard
  query change accordingly.
- **D2 — Status taxonomy (derived, no job).** Every Stay resolves at read time to exactly one
  bucket: **active-upcoming** (`status='active'` and not past) and **in-progress** (arrival past,
  departure future) → **dashboard**; **attended** (`status='active'` and departure past) → **History
  tagged "attended"**; **cancelled** (`status='cancelled'`, any date) → **History tagged
  "cancelled"** (cancelled already leaves the active dashboard per 002 FR-010). "Past" uses the
  identical 002 predicate — `departure_date < destination-local today` via `tzFromCoords` /
  `isPast` — **derived at read time, no cron, no stored "attended" column** (D14).
- **D3 — Folder entity & name rules.** A `folder` is user-owned: `name` is required, trimmed,
  1–60 chars, **unique per user (case-insensitive)**; folders are **ordered by creation** (no manual
  drag in v1). Renaming to an existing name is rejected (`folder.name_taken`). Cascades from the
  user (account deletion removes folders; the Stays survive — D4).
- **D4 — "Unfiled" = `folder_id IS NULL`.** 004 adds the FK `stay.folder_id → folder(id)` with
  **`ON DELETE SET NULL`**. "Unfiled" is the **virtual group** of Stays with `folder_id IS NULL` —
  not a real folder; it can't be renamed/deleted and always exists. Deleting a folder is a single
  `DELETE` and the cascade reassigns its Stays to Unfiled (no app-side reassignment loop, no
  interactive txn). "Move a Stay to Unfiled" = clear its `folder_id`. The non-empty-folder delete
  **warning** is a frontend confirm dialog (reuses `confirm.required`).
- **D5 — Migration.** Adding the FK to the existing `stay` table is a **SQLite table-rebuild**
  (drizzle-kit), not an `ALTER`: the `folder` table is created **first** in the same migration, then
  `stay` is rebuilt preserving its existing indexes (`stay_user_idx`, `stay_user_arrival_idx`,
  `stay_lat_lng_idx`) + the new `(user_id, folder_id)` and `(user_id, departure_date)` indexes, and
  the `commitment.stay_id` FK must survive. **Pre-launch (no real data) → drop/recreate is
  acceptable.**
- **D6 — Assignment surfaces.** A Stay's folder is set in **two** places: (a) the existing 002
  Add/Edit Stay form `folderId` field — now backed by real folders, with an **inline "create
  folder"**; and (b) a **"move to folder"** action on the Stay card. Assigning to a folder the
  caller doesn't own is rejected (`resource.not_found`).
- **D7 — Folder CRUD API + DTO.** New `FolderDTO { id, name, stayCount, createdAt }` and folder
  endpoints (`GET/POST/PATCH/DELETE /api/folders`). Browse-by-folder fetches folders + Stays and
  **groups client-side by `folderId`** (keeps `OwnerStayDTO` unchanged; folder name not embedded
  per-stay).
- **D8 — Permanent delete (pulled in from 002 follow-ups).** A **cancelled** Stay can be
  **permanently hard-deleted** from History, confirm-guarded (`DELETE /api/stays/:id/permanent`;
  `stay.not_cancelled` if the Stay isn't cancelled). Distinct from 002's soft-cancel. Hard delete
  cascades to any `commitment.stay_id` (set null — 003) so 003 data stays consistent.
- **D9 — Duplicate stay (pulled in).** A **"duplicate"** action on a Stay opens the 002 Add-Stay
  form **pre-filled** from the source (location, num_men, prayer needs, Sefer Torah, contact, notes,
  folder) with **cleared dates** for the user to set — reuses the 002 create flow client-side (no
  backend duplicate endpoint; a fresh `POST /api/stays`).
- **D10 — History pagination.** History is **cursor-paginated** (`GET /api/stays?scope=history&
  cursor=&limit=`), newest-departure first, returning `{ stays, nextCursor }`; the UI is
  **infinite-scroll**, grouped by year, sortable by date or folder. Backed by a `(user_id,
  departure_date)` index.
- **D11 — Owner-only.** Folder + History reads are owner-scoped and serialize via `OwnerStayDTO` /
  `FolderDTO`; 004 introduces **no public projection** (folders are the user's own).
- **D12 — Error codes.** Add `folder.name_taken`, `stay.not_cancelled` to the shared `ERROR_CODES`;
  reuse `resource.not_found` (folder/stay ownership) and `confirm.required` (delete-folder +
  permanent-delete). `location.required`-style keyed messages localized he/en.
- **D13 — Cache keys.** The stays TanStack key is parameterized by scope (`["stays","active"]` /
  `["stays","history"]`) + a `["folders"]` key; assign/move/cancel/duplicate/permanent-delete/folder
  mutations invalidate the affected keys (the current flat `["stays"]` assumption is updated).
- **D14 — Same-day-departure boundary.** History membership uses 002's exact boundary
  (`departure_date < destination-local today`); a same-day-departure Stay stays active until the
  date passes — no new boundary logic.

---

## User Scenarios & Testing

### User Story 1 — Organize Stays into Folders (Priority: P1)

A user creates folders and assigns Stays to them, and browses the dashboard by folder.

**Independent Test**: A user creates "Europe 2026", assigns two Stays, renames it to "Summer
Europe", and deletes a separate empty folder — with no Stay data loss.

**Acceptance Scenarios**:

1. **Given** a user creates a folder, **When** they assign a Stay to it, **Then** the Stay appears
   under that folder in the dashboard.
2. **Given** a user renames a folder, **When** saved, **Then** its Stays remain intact under the new
   name; renaming to an existing folder name is rejected (`folder.name_taken`).
3. **Given** a user deletes a folder containing Stays, **When** they confirm the warning, **Then**
   its Stays move to **Unfiled** (`folder_id` cleared via the cascade) — never deleted (D4).
4. **Given** the dashboard, **When** viewed, **Then** the user can browse by folder (incl. an
   **Unfiled** group) or see all active Stays flat.
5. **Given** the Add/Edit Stay form, **When** the user picks or **inline-creates** a folder,
   **Then** the Stay is assigned to it (D6); assigning to a folder the user doesn't own is rejected.
6. **Given** an empty folder, **When** deleted, **Then** it is removed without a reassignment warning
   (nothing to reassign).

---

### User Story 2 — History of Past Stays (Priority: P2)

A user reviews Stays whose dates have passed, in a dedicated History view.

**Independent Test**: A user with one past, one cancelled, and two upcoming Stays opens History and
sees the past Stay tagged "attended" and the cancelled one tagged "cancelled" — and neither appears
on the active dashboard.

**Acceptance Scenarios**:

1. **Given** a Stay whose departure date has passed, **When** the user opens History, **Then** it
   appears tagged **"attended"** and is **absent from the active dashboard** (D1/D2).
2. **Given** a cancelled Stay, **When** History loads, **Then** it appears tagged **"cancelled"**
   (distinct from "attended"); it is not on the active dashboard.
3. **Given** the History view, **When** it loads, **Then** past Stays are grouped by year and
   sortable by date or folder, and **scroll loads more** (cursor pagination, D10).
4. **Given** a Stay spanning today (arrival past, departure future), **When** History loads,
   **Then** it is **not** in History (still active on the dashboard, D14).

---

### User Story 3 — Duplicate & Prune (Priority: P3, pulled in from 002 follow-ups)

A user quickly re-registers a similar trip, and permanently removes cancelled Stays they no longer
want.

**Independent Test**: A user duplicates a past Stay (form pre-filled, dates cleared) and saves a new
upcoming Stay; then permanently deletes a cancelled Stay from History and it is gone.

**Acceptance Scenarios**:

1. **Given** any Stay, **When** the user taps "duplicate", **Then** the Add-Stay form opens
   pre-filled with the source's details and **cleared dates**; saving creates a new active Stay
   (D9).
2. **Given** a **cancelled** Stay in History, **When** the user confirms "delete permanently",
   **Then** the Stay row is hard-deleted (D8); a non-cancelled Stay cannot be permanently deleted
   (`stay.not_cancelled`).

---

### Edge Cases

- Deleting a folder with Stays → Stays reassigned to Unfiled (`folder_id` SET NULL), never deleted
  (D4).
- A Stay spanning today (started, not ended) → remains active/dashboard, not in History (D14).
- A cancelled Stay → in History tagged "cancelled", distinct from attended; not on the dashboard.
- A cancelled Stay that is also past → tagged "cancelled" (cancelled wins over attended).
- Renaming a folder to a duplicate name → rejected; empty-name/whitespace → rejected.
- Moving a Stay between folders → only its `folder_id` changes; all other fields untouched (SC-001).
- A Stay assigned to a folder then cancelled → leaves active folder browse, shows in History
  tagged cancelled.
- History at scale (years of Stays) → cursor pagination + year grouping; no unbounded single fetch.
- Concurrent delete-folder + assign-to-that-folder → the FK SET NULL / ownership check resolves
  deterministically (no orphan, no foreign assignment).

---

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to create, rename, and delete personal folders; names are trimmed,
  1–60 chars, **unique per user (case-insensitive)** — duplicate create/rename returns
  `folder.name_taken` (D3).
- **FR-002**: A user MUST be able to assign Stays to folders and move them between folders, from the
  Add/Edit Stay form (with inline folder creation) and a Stay-card action; assignment to a
  non-owned folder MUST be rejected (`resource.not_found`) (D6/D11).
- **FR-003**: Deleting a non-empty folder MUST warn the user (confirm) and reassign its Stays to
  **Unfiled** via the `stay.folder_id` FK `ON DELETE SET NULL` — Stays are never deleted (D4/SC-004).
- **FR-004**: The active dashboard MUST allow browsing Stays by folder (including an **Unfiled**
  group) or as a flat list, and MUST show **only active (upcoming/in-progress)** Stays (D1).
- **FR-005**: A **History** view MUST show past Stays — `status='active'` & departure passed tagged
  **"attended"**, and `status='cancelled'` tagged **"cancelled"** — removed from the active
  dashboard, grouped by year, sortable by date/folder, and **cursor-paginated (infinite scroll)**.
  Membership is **derived at read time** (no scheduled job), using 002's destination-local
  `departure_date < today` predicate (D2/D10/D14).
- **FR-006**: A user MUST be able to **permanently delete a cancelled Stay** from History,
  confirm-guarded (`DELETE /api/stays/:id/permanent`); permanently deleting a non-cancelled Stay
  MUST be rejected (`stay.not_cancelled`) (D8).
- **FR-007**: A user MUST be able to **duplicate** a Stay — opening the Add-Stay form pre-filled
  from the source with cleared dates, saving as a new active Stay (D9).
- **FR-008**: Folder + History reads MUST be **owner-scoped** and serialize via `OwnerStayDTO` /
  `FolderDTO`; 004 introduces no public projection (D11).
- **FR-009**: All 004 UI — folder create/rename/delete-confirm dialogs, browse-by-folder toggle,
  Unfiled group, History list/infinite-scroll, move-to-folder, duplicate, permanent-delete — MUST
  meet WCAG 2.1 AA, be RTL-correct and keyboard-operable, use ≥44px touch targets, announce list
  changes via `aria-live`, and use i18n-only strings + tokens-only colors (constitution).

### Key Entities

- **Folder** — user-owned grouping: `id` (prefixed `fld_`), `user_id` (FK → `user`, ON DELETE
  CASCADE), `name` (1–60, unique per user ci), `created_at`, `updated_at`. Ordered by `created_at`.
- **Stay ↔ Folder** — `stay.folder_id` (nullable) gains FK → `folder(id)` **ON DELETE SET NULL**
  (D4). Existing Stay fields/derivations (`isPast`, `coversShabbat`, `status`) unchanged.
- **Unfiled** — virtual group of `folder_id IS NULL` Stays; not a row; always present (D4).
- **Derived `attended`** — `isPast && status='active'`; `historyTag ∈ {attended, cancelled}` for
  the History DTO (D2).

This feature establishes folder management, the Stay↔Folder FK, the History scope, and the
duplicate/permanent-delete actions.

---

## Success Criteria

- **SC-001**: Folder create/rename/delete/move complete with **no Stay data loss** — every affected
  Stay row still exists with all non-`folder_id` fields unchanged and `folder_id` equal to the
  expected value (target folder, or NULL after a folder delete), in 100% of cases.
- **SC-002**: A Stay appears in History **immediately on the first read after** its destination-local
  departure date passes (derived, no job) and is then absent from the active dashboard.
- **SC-003**: Browse-by-folder returns exactly that folder's active Stays; **Unfiled** returns
  exactly the `folder_id IS NULL` active Stays — in 100% of cases.
- **SC-004**: Deleting a folder never deletes a Stay (cascade SET NULL) — 100%.
- **SC-005**: History sort/group + cursor pagination return correct, complete, **non-duplicated**
  sets across pages.
- **SC-006**: Permanent delete removes only the targeted **cancelled** Stay and is rejected for any
  non-cancelled Stay — 100%.
- **SC-007**: Folder management + History meet WCAG 2.1 AA, are RTL-correct and keyboard-operable
  (verified with Playwright + axe-core).

---

## Assumptions

- Folders group a user's own Stays only (not Minyanim or other users' data).
- "Attended" is inferred from the departure date passing; no explicit check-in in v1 (D2).
- The active dashboard becoming active-only is a deliberate amendment of 002 FR-005/FR-011 (D1).
- Pre-launch: no real data, so the FK-adding `stay` rebuild may drop/recreate (D5).
- Manual folder reordering and nested/sub-folders are out of scope for v1 (folders ordered by
  creation, flat).
