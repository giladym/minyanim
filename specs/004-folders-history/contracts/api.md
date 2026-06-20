# Phase 1 API Contracts — Folders & History

Base: `/api` on the backend Worker (Hono). Auth via the better-auth session cookie (001). All routes
**owner-scoped**. Conventions inherited from 001–003: `401 auth.required`; `404 resource.not_found`
if missing **or not owned** (never leak / never 403); `400 { errors:[{field,code,params?}] }`;
plain Hono + `safeParse`, DTOs via `*.parse()` before `c.json()`; keyed error codes localized he/en.

---

## Folders

### `GET /api/folders`
List the caller's folders (ordered by `created_at`) with active-Stay counts.
→ `200 { folders: FolderDTO[] }` where `FolderDTO = { id, name, stayCount, createdAt }`.

### `POST /api/folders`
Create. Body `CreateFolderInput { name: trim().min(1,"folder.name_required").max(60,"folder.name_too_long") }`.
→ `201 FolderDTO` · `400 folder.name_taken` (duplicate per-user, case-insensitive — enforced by the
`folder(user_id, name COLLATE NOCASE)` unique index, R2) · `400 folder.name_required` /
`folder.name_too_long`.

### `PATCH /api/folders/:id`
Rename. Body `{ name }`. → `200 FolderDTO` · `404` if not owned · `400 folder.name_taken`.

### `DELETE /api/folders/:id`
Delete a folder. `{ "confirm": true }` (else `400 confirm.required`). A single `DELETE` — the
`stay.folder_id ON DELETE SET NULL` cascade reassigns its Stays to **Unfiled** (no Stay deleted,
D4/FR-003/SC-004). Idempotent-ish: `404` if not owned. → `200 { ok: true }`.

---

## Stays (extended — amends 002 per D1)

### `GET /api/stays?scope=active|history&folder=<id|unfiled>&cursor=`
`scope` ∈ `StayScope = {active, history}` (default `active`). **`isPast` is tz-derived in-service,
not a SQL column** — so scope is applied in the service, not as a SQL predicate:
- **`scope=active`**: repo returns `status='active'`; service **filters out `isPast`** → upcoming/
  in-progress only. Optional `folder=<id>|unfiled`. No pagination (bounded). Client groups by
  `folderId`. → `200 { stays: OwnerStayDTO[] }`.
- **`scope=history`**: a separate query — coarse SQL (`status='cancelled' OR departure_date <
  today_utc+1d`) keyset-paginated on `(departure_date DESC, id DESC)`, **refined in-service** by
  `historyTag`, with `nextCursor` from the last KEPT row + loop-fill so pages are complete/
  non-duplicated (R5/SC-005). → `200 HistoryPage = { stays: OwnerStayDTO[], nextCursor: string|null }`,
  newest-departure first. `cursor` = base64 `${departureDateMs}_${id}`.
`OwnerStayDTO` gains derived **`historyTag`** (`attended` | `cancelled` | `null`); **no job**
(SC-002). Coordless Stays pin history `isPast` to UTC (stable across devices). `401` if unauthenticated.

> Amends 002: `listStays`/`StaysDashboard` were active+past; now the dashboard requests
> `scope=active` and History requests `scope=history`. 002 FR-005/FR-011 (show past on dashboard)
> are superseded (D1).

### `PATCH /api/stays/:id` (assign/move folder — extends 002 update)
Body may include `folderId: string|null`. The target folder MUST be owned by the caller (else
`404 resource.not_found`); `null` moves the Stay to **Unfiled**. Only `folder_id` changes for a
move (SC-001). → `200 OwnerStayDTO`.

### `DELETE /api/stays/:id/permanent` (D8)
**Hard-delete** a Stay, allowed **only if `status='cancelled'`** (else `400 stay.not_cancelled`).
`{ "confirm": true }` (else `400 confirm.required`). Cascades to `commitment.stay_id` (SET NULL,
003). → `200 { ok: true }` · `404` if not owned. (002's soft-cancel `POST /api/stays/:id/cancel` is
unchanged.)

### Duplicate (D9) — no endpoint
Client-side: a "duplicate" action opens the 002 Add-Stay form pre-filled from a source Stay
(location, num_men, prayer needs, Sefer Torah, contact, notes, folder) with **cleared dates**;
saving is a normal `POST /api/stays` (full temporal validation applies).

---

## Errors (004 additions)

| Code | Meaning |
|------|---------|
| `folder.name_taken` | folder name duplicates one of the caller's (case-insensitive) |
| `folder.name_required` | folder name empty after trim |
| `folder.name_too_long` | folder name > 60 chars |
| `stay.not_cancelled` | permanent-delete attempted on a non-cancelled Stay |

Plus inherited: `auth.required`, `resource.not_found` (folder/stay ownership), `confirm.required`
(delete folder + permanent-delete), `location.required`-style validation, `server.error`.
