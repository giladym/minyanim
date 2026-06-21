# Phase 1 Data Model — Folders & History

Date: 2026-06-21 · Storage: Cloudflare D1 (SQLite) via Drizzle. Extends
[002 data-model](../002-stays-create-manage/data-model.md) (resolves its `folder_id` seam / D9).
**Pre-launch: no real data — the `stay` rebuild may drop/recreate (D5).**

---

## Entity: `folder`

A user-owned grouping of that user's Stays. Cascade-deleted with the user (the Stays survive — D4).

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | app-generated, prefixed `fld_…` |
| user_id | text, FK → `user(id)` | **ON DELETE CASCADE**; indexed |
| name | text, NOT NULL | trimmed, 1–60; **unique per user (case-insensitive)** — DB-enforced (R2) |
| created_at / updated_at | integer (ts) | epoch; list ordered by `created_at` |

Indexes: `folder_user_idx` on `(user_id)`; **`UNIQUE INDEX folder_user_name_uidx ON folder(user_id,
name COLLATE NOCASE)`** (raw SQL — Drizzle can't express COLLATE; DB-authoritative uniqueness closes
the create race, R2). The service maps the constraint violation to `folder.name_taken`.

## Change to `stay` (the 002 seam, D4/D5)

`stay.folder_id` (already nullable, no FK) gains:

```
folderId: text("folder_id").references(() => folder.id, { onDelete: "set null" })
```

Adding the FK can't be an `ALTER` in SQLite. **`commitment.stay_id` already FK-references `stay(id)`
(003)**, and drizzle-kit's auto-rebuild emits `PRAGMA foreign_keys=OFF` wrappers that **D1 rejects**
(D1 manages FK state). **Decision (R3): pre-launch, no data → migration `0004` (in `apps/backend/migrations/`, the
drizzle `out` dir — NOT `src/migrations/`) drops + recreates in dependency order** — drop `commitment` + `stay`, create `folder`, recreate `stay` (with the
`folder_id` FK + indexes below), recreate `commitment` (with its `stay_id` FK). Generate via
drizzle-kit, **review the SQL, strip any `PRAGMA foreign_keys` lines**, and **test** that after the
migration `PRAGMA foreign_key_list(commitment)` still shows `stay_id → stay`.

Indexes preserved/added on `stay`: `stay_user_idx`, `stay_user_arrival_idx`, `stay_lat_lng_idx`,
- `stay_user_folder_idx` on `(user_id, folder_id)` — browse-by-folder.
- `stay_user_departure_idx` on `(user_id, departure_date, id)` — History keyset (id in the index so
  the `(departure_date DESC, id DESC)` tiebreaker doesn't filesort, R5).

## Derived (not stored) — `stayService`, D2

- **isPast** (reused from 002) = `civilDate(departure_date,"UTC") < todayCivil(tzFromCoords(lat,lng))`.
  For **coordless** Stays, History pins to **UTC** (NOT the viewer's clientTz) so membership is stable
  across devices (R5/ARC-10) — a deliberate divergence from 002's viewer-tz fallback, scoped to
  History.
- **historyTag** (computed in `toOwnerDTO`, threaded through `toOwnerResponse`; omitted from
  `PublicStayDTO` — R6): `status='cancelled'` → `"cancelled"`; else `isPast` → `"attended"`; else
  `null`.
- **scope membership is DERIVED in-service, not SQL** (`isPast` is tz-computed, not a column): `active`
  ⇔ `status='active'` then `filter(!isPast)`; `history` ⇔ `historyTag != null`. No stored column, no
  cron (SC-002).

### scope/status truth table (the test oracle)

| status | isPast | scope=active? | scope=history? | historyTag |
|---|---|---|---|---|
| active | false | ✅ (upcoming/in-progress) | — | null |
| active | true | — | ✅ | attended |
| cancelled | false | — | ✅ | cancelled |
| cancelled | true | — | ✅ | cancelled |

## Queries

- **Active dashboard**: repo `listStays` (`status='active'`) → **in-service `filter(!isPast)`**
  (isPast is tz-derived, not SQL; N bounded). Group client-side by `folder_id` (Unfiled = null).
- **History page (R5)** — keyset + in-service refine, completeness-safe: a **NEW** repo query (the
  shipped `listStays` returns active-only, can't serve cancelled). Coarse inclusive SQL
  `WHERE user_id=? AND (status='cancelled' OR departure_date < (today_utc + 1 day)) AND
  (departure_date,id) < cursor ORDER BY departure_date DESC, id DESC LIMIT pageSize+buffer`; then
  **refine `isPast` in-service**, keep `historyTag != null`, and set **`nextCursor` from the last
  KEPT row** (loop-fetch the next batch if a page underfills) so pages are complete + non-duplicated
  (SC-005). Cursor = base64 `${departureDateMs}_${id}`.
- **Folder list**: folders + a grouped `COUNT(*)` of the user's active Stays per `folder_id`
  → `FolderDTO.stayCount`.

## Lifecycle / state

- **Folder create/rename**: validate name (trim, 1–60, unique-per-user ci → `folder.name_taken`).
- **Folder delete**: confirm-guarded; single `DELETE folder` → `ON DELETE SET NULL` reassigns its
  Stays to Unfiled (FR-003/SC-004) — no app-side loop, no interactive txn.
- **Assign/move Stay**: `PATCH /api/stays/:id { folderId }` — verify target folder owned (R7), else
  `resource.not_found`; only `folder_id` changes (SC-001).
- **Permanent delete (D8)**: hard `DELETE stay` **iff `status='cancelled'`** (`stay.not_cancelled`
  otherwise), confirm-guarded; cascades to `commitment.stay_id` (SET NULL, 003).
- **Duplicate (D9)**: client-side — prefill the 002 Add form from a source; fresh `POST /api/stays`.
- **Account deletion (001)**: `folder` cascades from `user`; Stays already cascade. Verify by test.

## DTO boundary (D11)

- `FolderDTO { id, name, stayCount, createdAt }`; `CreateFolderInput`/`UpdateFolderInput`
  `{ name: trim().min(1,"folder.name_required").max(60,"folder.name_too_long") }`; `StayScope` enum.
- Stays serialize via **`OwnerStayDTO`** + a new derived **`historyTag`** — which must be added in
  **THREE** hand-built places or it silently drops (R6): the `OwnerStayDTO` interface, `toOwnerDTO`
  (compute), and `toOwnerResponse` (controller allowlist). **Omitted** from `PublicStayDTO`/
  `toPublicStayDTO` (owner-only; 003 public projection unchanged).
- `HistoryPage { stays: OwnerStayDTO[], nextCursor: string|null }` for `scope=history`.
- No public projection introduced by 004 (folders/History are owner-only).

## Tests (data-model-critical)

- **Cascade-orphan** (extends 002/003): create user + folders + stays(+ in folders) → `deleteUser`
  → zero orphan `folder` rows (and Stays gone via their own cascade).
- **Folder-delete → SET NULL**: a folder with Stays deleted → those Stays survive with
  `folder_id IS NULL` (SC-004/SC-001).
- **scope truth table** (SC-002/SC-003): the 4-row table above via `vi.setSystemTime`.
- **Name uniqueness** (R2): duplicate create/rename (ci) → `folder.name_taken`.
- **History pagination** (SC-005): keyset pages are complete + non-duplicated across the boundary.
- **Permanent-delete guard** (SC-006): cancelled → deleted; active/attended → `stay.not_cancelled`.
